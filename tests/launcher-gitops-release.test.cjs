const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
test('launcher signing requires exact prior main, owner, and one isolated request commit',async()=>{
 const {validateReleaseRequest,assertReleaseContext,REQUEST_PATH}=await import('../scripts/livekarte-launcher-release-request.mjs');
 const before='a'.repeat(40),after='b'.repeat(40);
 const raw={schema:1,intent:'livekarte-launcher-signed-release',request_id:'2026-11-27-first-launcher',source_sha:before,expected_version_code:1};
 const r=validateReleaseRequest(raw);
 const env={GITHUB_REPOSITORY:'CobraChris/meine-livekarte',GITHUB_ACTOR:'CobraChris',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push'};
 const parents=after+' '+before;
 assert.doesNotThrow(()=>assertReleaseContext(env,r,before,after,parents,REQUEST_PATH));
 for(const patch of [{schema:2},{intent:'other'},{expected_version_code:0},{source_sha:'main'},{token:'forbidden'}])
   assert.throws(()=>validateReleaseRequest({...raw,...patch}));
 for(const patch of [{GITHUB_ACTOR:'bot'},{GITHUB_REF:'refs/heads/feature'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REPOSITORY:'CobraChris/other'}])
   assert.throws(()=>assertReleaseContext({...env,...patch},r,before,after,parents,REQUEST_PATH));
 assert.throws(()=>assertReleaseContext(env,{...r,source_sha:'c'.repeat(40)},before,after,parents,REQUEST_PATH));
 assert.throws(()=>assertReleaseContext(env,r,before,after,parents,REQUEST_PATH+'\nandroid-launcher/build.gradle'));
 assert.throws(()=>assertReleaseContext(env,r,before,after,parents+' '+'c'.repeat(40),REQUEST_PATH));
 assert.throws(()=>assertReleaseContext(env,r,before,after,parents,''));
});
test('release workflow builds without secrets and signs only after validation and build',()=>{
 const y=fs.readFileSync(path.join(__dirname,'../.github/workflows/android-launcher-release.yml'),'utf8');
 assert.match(y,/branches: \[main\]/);
 assert.match(y,/paths: \['requests\/livekarte-launcher-release.json'\]/);
 assert.doesNotMatch(y,/pull_request_target:|workflow_run:|workflow_dispatch:|repository_dispatch:/);
 const split=y.indexOf('\n  sign:');
 assert.ok(split>0);
 const build=y.slice(0,split),sign=y.slice(split);
 assert.doesNotMatch(build,/secrets\./);
 assert.match(build,/source_sha/);
 assert.match(build,/:app:testDebugUnitTest :app:lintDebug :app:assembleRelease/);
 assert.match(sign,/needs: \[validate,build\]/);
 assert.match(sign,/environment: android-releases/);
 assert.match(sign,/cmp -s previous\/fingerprint signed\/fingerprint/);
 assert.match(sign,/Refusing Android versionCode downgrade/);
 assert.match(sign,/apksigner" verify/);
});
