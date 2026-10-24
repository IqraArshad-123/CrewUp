import {readdir,lstat,unlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import {config} from '../src/config';
export async function cleanTemporaryUploads(root=path.resolve(config.PRIVATE_FILES_DIR,'tmp'),apply=false,now=Date.now()){
 let canonical:string;try{if((await lstat(root)).isSymbolicLink())throw new Error('Refusing a linked temporary directory');canonical=await realpath(root)}catch(e:any){if(e.code==='ENOENT')return [];throw e}
 const files:string[]=[];async function walk(dir:string,depth:number){if(depth>2)return;for(const item of await readdir(dir,{withFileTypes:true})){if(item.isSymbolicLink())continue;const full=path.resolve(dir,item.name);const relative=path.relative(canonical,full);if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Temporary file path escaped its root');if(item.isDirectory())await walk(full,depth+1);else if(item.isFile()&&item.name.endsWith('.pdf')&&(await lstat(full)).mtimeMs<now-86400000){files.push(full);if(apply)await unlink(full)}}}await walk(canonical,0);return files;
}
if(require.main===module)cleanTemporaryUploads(undefined,process.argv.includes('--apply')).then(files=>console.log(`${process.argv.includes('--apply')?'Removed':'Would remove'} ${files.length} expired temporary PDF uploads. Retained CV versions are untouched.`)).catch(e=>{console.error(e.message);process.exitCode=1});
