import {Router} from 'express';
import type pg from 'pg';
import {z} from 'zod';
import {requireAuthentication} from '../../middleware/authenticate.js';
import {inUserTransaction} from '../../routes/helpers.js';
import {dateSchema} from '../../validation/common.js';
import {getDashboard} from './repository.js';

const querySchema=z.object({
  timeframe:z.enum(['daily','weekly','monthly','6-month','annual','this-week','this-month','last-month','last-30-days','this-year','custom']).default('monthly'),
  anchor:dateSchema.optional(), from:dateSchema.optional(), to:dateSchema.optional(),
}).superRefine((value,ctx)=>{
  if(value.timeframe==='custom' && (!value.from || !value.to || value.to<value.from || (Date.parse(value.to)-Date.parse(value.from))/86400000>730))
    ctx.addIssue({code:'custom',path:['to'],message:'Choose a valid range of up to 731 days.'});
});

export function createDashboardRouter(pool:pg.Pool):Router{
  const router=Router();router.use(requireAuthentication(pool));
  router.get('/',async(request,response)=>{
    const query=querySchema.parse(request.query);
    const data=await inUserTransaction(pool,request,(client,userId)=>
      getDashboard(client,userId,query.timeframe,query.anchor,query.from,query.to));
    response.json({data});
  });
  return router;
}
