import{readFileSync,writeFileSync,existsSync}from'node:fs';
const folder='artifacts/completion-v074/clean';
if(existsSync(folder+'/dev-http.json'))throw Error('Preserve prior check');
const response=await fetch('http://127.0.0.1:5191'),html=await response.text();
const report={at:new Date().toISOString(),url:response.url,httpStatus:response.status,title:/<title>([^<]*)<\/title>/.exec(html)?.[1],sourceEntry:html.includes('/src/main.ts'),scope:'Independent current checkout dev service HTTP only; actual normal CLI stop logged separately, no gameplay qualification.'};
writeFileSync(folder+'/dev-http.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(response.status!==200||!report.sourceEntry)process.exitCode=1;
