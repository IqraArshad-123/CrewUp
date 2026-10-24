import express from 'express';import {connect} from './models';import {buildApp} from './app';import {config} from './config';import {requireEmail} from './mailer';import {readyRedis} from './infrastructure';
// Request-driven adapter; scheduled work remains in the separate worker process.
const app=express();let ready:Promise<ReturnType<typeof buildApp>>|undefined;
async function initialize(){if(config.production){requireEmail();if(config.FILE_STORAGE!=='s3')throw new Error('Serverless deployment requires durable object storage.');if(!config.REDIS_URL)throw new Error('Redis is required.');if(new URL(config.APP_URL).protocol!=='https:')throw new Error('HTTPS origin required.');}await connect();await readyRedis();return buildApp();}
app.use(async(req,res,next)=>{try{ready??=initialize().catch(e=>{ready=undefined;throw e;});const handler=await ready;handler(req,res,next);}catch{res.status(503).json({error:{message:'Service is initializing or a dependency is unavailable.'}});}});
export default app;
