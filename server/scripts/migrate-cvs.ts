import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { connect } from '../src/models';
import { Resume } from '../src/hiring-models';
import { config } from '../src/config';
import { putPrivate, readPrivate, validatePdf } from '../src/storage';

// Default is read-only. Original files remain until migration is verified.
async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && (!config.S3_BUCKET || !config.S3_ENDPOINT))
    throw new Error('Configure private cloud storage before applying migration.');
  await connect();
  const resumes = await Resume.find({ storage: 'local' }).select('+storageKey');
  let verified = 0;
  for (const resume of resumes) {
    const bytes = await readPrivate('local', resume.storageKey);
    await validatePdf(bytes);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (checksum !== resume.sha256 || bytes.length !== resume.size)
      throw new Error('A retained CV failed its integrity check. Migration stopped.');
    if (apply) {
      await putPrivate('s3', resume.storageKey, bytes);
      const remote = await readPrivate('s3', resume.storageKey);
      if (!remote.equals(bytes)) throw new Error('Cloud file comparison failed.');
      const result = await Resume.updateOne(
        { _id: resume._id, storage: 'local', sha256: checksum },
        { $set: { storage: 's3' } },
      );
      if (result.modifiedCount !== 1) throw new Error('CV record changed during migration.');
    }
    verified++;
  }
  console.log(JSON.stringify({ mode: apply ? 'migrated' : 'dry-run', verifiedFiles: verified, localFilesRetained: true }));
}
main().catch(error => {
  console.error('CV migration stopped: ' + (error.codeName || error.name || 'Error'));
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
