/** Owner-approved, request-only GitOps release. No access to signing secrets. */
import {readFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const REQUEST_PATH='requests/livekarte-launcher-release.json';
const sha=/^[a-f0-9]{40}$/;
export function validateReleaseRequest(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).sort().join(',')!=='expected_version_code,intent,request_id,schema,source_sha'||
     value.schema!==1||value.intent!=='livekarte-launcher-signed-release'||
     typeof value.request_id!=='string'||!/^20\d\d-\d\d-\d\d-[a-z0-9-]{3,60}$/.test(value.request_id)||
     typeof value.source_sha!=='string'||!sha.test(value.source_sha)||
     !Number.isSafeInteger(value.expected_version_code)||value.expected_version_code<1||
     value.expected_version_code>2100000000)throw Error('Invalid release request');
  return {source_sha:value.source_sha,version_code:value.expected_version_code};
}
export function assertReleaseContext(env,request,before,after,parents,diff){
  if(env.GITHUB_REPOSITORY!=='CobraChris/meine-livekarte'||env.GITHUB_ACTOR!=='CobraChris'||
     env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='push')
     throw Error('Untrusted release context');
  if(!sha.test(before)||!sha.test(after)||before===after||request.source_sha!==before||
     parents.trim()!==after+' '+before||diff.trim()!==REQUEST_PATH)
     throw Error('Release requires exactly one request-only commit on previously reviewed main');
}
function run(){
  const env=process.env;
  const request=validateReleaseRequest(JSON.parse(readFileSync(REQUEST_PATH,'utf8')));
  const before=env.REQUEST_BEFORE||'',after=env.GITHUB_SHA||'';
  if(!sha.test(before)||!sha.test(after))throw Error('Invalid event commit');
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8',timeout:15000});
  if(git('rev-parse','HEAD').trim()!==after)throw Error('Unexpected checkout');
  assertReleaseContext(env,request,before,after,git('rev-list','--parents','-n','1',after),
    git('diff','--name-only','--no-renames',before,after));
  if(!env.GITHUB_OUTPUT)throw Error('Missing workflow output');
  appendFileSync(env.GITHUB_OUTPUT,'source_sha='+request.source_sha+'\nversion_code='+request.version_code+'\n');
  console.log('Approved pinned main source '+request.source_sha+', versionCode '+request.version_code);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  try{run();}catch(e){console.error('Release request rejected: '+e.message);process.exitCode=1;}
