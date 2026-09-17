import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { translateDatabaseError } from '../../db/errors.js';
import { ApiError } from '../../errors.js';
import { requireAuthentication } from '../../middleware/authenticate.js';
import { inUserTransaction, pickFields, requireRow } from '../../routes/helpers.js';
import { booleanQuerySchema, currencySchema, dateSchema, positiveMoneySchema, uuidSchema } from '../../validation/common.js';
import { createRule, disableRule, getRule, listRules, updateRule, type RecurringWrite } from './repository.js';

const nullableId = uuidSchema.nullable().optional().default(null);
const ruleSchema = z.object({
  name:z.string().trim().min(1).max(120),
  kind:z.enum(['expense','income','transfer','asset_purchase','asset_sale','liability_drawdown','liability_payment','adjustment']),
  sourceAccountId:nullableId,destinationAccountId:nullableId,categoryId:nullableId,
  assetId:nullableId,liabilityId:nullableId,
  amount:positiveMoneySchema,currency:currencySchema,
  intervalCount:z.number().int().positive().max(10_000),
  intervalUnit:z.enum(['day','week','month','year']),
  startsOn:dateSchema,nextDueOn:dateSchema,endsOn:dateSchema.nullable().optional().default(null),
  description:z.string().trim().max(2_000).nullable().optional().default(null),
  isActive:z.boolean().default(true),
}).strict().superRefine((value,context)=>{
  const source=Boolean(value.sourceAccountId),destination=Boolean(value.destinationAccountId);
  const valid=(value.kind==='expense'&&source&&!destination)||(value.kind==='income'&&!source&&destination)||
    (value.kind==='transfer'&&source&&destination&&value.sourceAccountId!==value.destinationAccountId)||
    (value.kind==='asset_purchase'&&source&&!destination&&Boolean(value.assetId))||
    (value.kind==='asset_sale'&&!source&&destination&&Boolean(value.assetId))||
    (value.kind==='liability_drawdown'&&destination&&Boolean(value.liabilityId))||
    (value.kind==='liability_payment'&&source&&Boolean(value.liabilityId))||
    (value.kind==='adjustment'&&source!==destination);
  if(!valid)context.addIssue({code:'custom',path:['kind'],message:'Account references do not match the rule kind.'});
  if(value.nextDueOn<value.startsOn)context.addIssue({code:'custom',path:['nextDueOn'],message:'nextDueOn cannot precede startsOn.'});
  if(value.endsOn&&value.endsOn<value.startsOn)context.addIssue({code:'custom',path:['endsOn'],message:'endsOn cannot precede startsOn.'});
});

async function validateReferences(client:pg.PoolClient,input:RecurringWrite):Promise<void>{
  const accountIds=[...new Set([input.sourceAccountId,input.destinationAccountId].filter(Boolean))];
  if(accountIds.length){
    const result=await client.query<{id:string;currency:string;is_archived:boolean}>(
      'SELECT id,currency,is_archived FROM accounts WHERE id=ANY($1::uuid[])',[accountIds]);
    if(result.rowCount!==accountIds.length||result.rows.some(row=>row.is_archived||row.currency!==input.currency))
      throw new ApiError(404,'related_resource_not_found','A related resource was not found.');
  }
  if(input.categoryId){
    const result=await client.query<{kind:string}>(
      'SELECT kind FROM categories WHERE id=$1 AND NOT is_archived',[input.categoryId]);
    const expected=input.kind==='income'?'income':input.kind==='expense'?'expense':null;
    if(!result.rows[0]||(expected&&![expected,'both'].includes(result.rows[0].kind)))
      throw new ApiError(404,'related_resource_not_found','A related resource was not found.');
  }
  if(input.assetId){
    const result=await client.query<{currency:string}>(
      'SELECT currency FROM assets WHERE id=$1 AND NOT is_archived',[input.assetId]);
    if(!result.rows[0]||result.rows[0].currency!==input.currency)
      throw new ApiError(404,'related_resource_not_found','A related resource was not found.');
  }
  if(input.liabilityId){
    const result=await client.query<{currency:string}>(
      `SELECT currency FROM liabilities WHERE id=$1 AND status <> 'cancelled'`,[input.liabilityId]);
    if(!result.rows[0]||result.rows[0].currency!==input.currency)
      throw new ApiError(404,'related_resource_not_found','A related resource was not found.');
  }
}

export function createRecurringRulesRouter(pool:pg.Pool):Router{
  const router=Router();
  router.use(requireAuthentication(pool));
  router.get('/',async(request,response)=>{
    const data=await inUserTransaction(pool,request,client=>
      listRules(client,booleanQuerySchema.parse(request.query.includeInactive)));
    response.json({data});
  });
  router.get('/:id',async(request,response)=>{
    const id=uuidSchema.parse(request.params.id);
    const data=await inUserTransaction(pool,request,async client=>requireRow(await getRule(client,id)));
    response.json({data});
  });
  router.post('/',async(request,response)=>{
    const input=ruleSchema.parse(request.body) as RecurringWrite;
    try{
      const data=await inUserTransaction(pool,request,async(client,userId)=>{
        await validateReferences(client,input);return createRule(client,userId,input);
      });
      response.status(201).json({data});
    }catch(error){translateDatabaseError(error);}
  });
  router.patch('/:id',async(request,response)=>{
    const id=uuidSchema.parse(request.params.id);
    try{
      const data=await inUserTransaction(pool,request,async client=>{
        const current=requireRow(await getRule(client,id));
        const input=ruleSchema.parse({
          ...pickFields(current,[
            'name','kind','sourceAccountId','destinationAccountId','categoryId','assetId',
            'liabilityId','amount','currency','intervalCount','intervalUnit','startsOn',
            'nextDueOn','endsOn','description','isActive',
          ]),...request.body,
        }) as RecurringWrite;
        await validateReferences(client,input);return requireRow(await updateRule(client,id,input));
      });
      response.json({data});
    }catch(error){translateDatabaseError(error);}
  });
  router.delete('/:id',async(request,response)=>{
    const id=uuidSchema.parse(request.params.id);
    const success=await inUserTransaction(pool,request,client=>disableRule(client,id));
    requireRow(success?true:undefined);response.status(204).send();
  });
  return router;
}
