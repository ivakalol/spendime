import {Router} from 'express';
import type pg from 'pg';
import {z} from 'zod';
import {requireAuthentication} from '../../middleware/authenticate.js';
import {inUserTransaction} from '../../routes/helpers.js';
import {dateSchema} from '../../validation/common.js';
import {getDashboard} from './repository.js';

const querySchema=z.object({
  timeframe:z.enum(['daily','weekly','monthly','6-month','annual']).default('monthly'),
  anchor:dateSchema.optional(),
});

export function createDashboardRouter(pool:pg.Pool):Router{
  const router=Router();router.use(requireAuthentication(pool));
  router.get('/',async(request,response)=>{
    const query=querySchema.parse(request.query);
    const data=await inUserTransaction(pool,request,(client,userId)=>
      getDashboard(client,userId,query.timeframe,query.anchor));
    response.json({data});
  });
  return router;
}
