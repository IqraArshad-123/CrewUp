import {config} from '../src/config';
import {emailReady} from '../src/mailer';
const checks:[string,boolean][]=[['Production environment',config.production],['Redis configured',!!config.REDIS_URL],['HTTPS app origin without a path',new URL(config.APP_URL).protocol==='https:'&&new URL(config.APP_URL).pathname==='/'],['SMTP provider configured',config.MAIL_MODE==='smtp'&&emailReady()],['MongoDB connection configured',!!config.MONGODB_URI],['Private storage configured',config.FILE_STORAGE==='s3'?!!config.S3_BUCKET:!!config.PRIVATE_FILES_DIR],['JWT secret is not the example value',config.JWT_SECRET.length>=32&&!config.JWT_SECRET.startsWith('replace-')]];
for(const [label,ok] of checks)console.log(`${ok?'PASS':'MISSING'}: ${label}`);
console.log('Configuration checks only; these do not confirm SMTP delivery, bucket access, HTTPS certificates or database backups.');
process.exitCode=checks.every(([,ok])=>ok)?0:1;
