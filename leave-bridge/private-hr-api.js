/**
 * IAM-protected, server-side HR HTTP routes. This handler MUST remain behind
 * Cloud Run IAM and internal ingress. Firebase user tokens are an additional
 * authorization check, not a substitute for Cloud Run service authentication.
 * No permissive CORS and no private records in logs.
 */
export function createPrivateHrApi(operations) {
 return async function handler(req,res) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
  const url=new URL(req.url,'http://localhost');
  const path=url.pathname;
  if(!path.startsWith('/internal/hr/')) return false;
  const authorization=req.headers?.['x-firebase-id-token'];
  // The Cloud Run IAM Authorization header is reserved for Google invocation identity.
  // A separate verified Firebase ID token is passed by a trusted proxy only.
  if(typeof authorization!=='string'||authorization.length>8192) {
   reply(401,{error:'unauthenticated'});return true;
  }
  const staffId=url.searchParams.get('staffId');
  const date=url.searchParams.get('date');
  try {
   if(req.method==='GET'&&path==='/internal/hr/entry') {
    const entry=await operations.read({authorization:'Bearer '+authorization,staffId,date});
    reply(200,{entry});return true;
   }
   if(req.method==='POST'&&(path==='/internal/hr/override'||path==='/internal/hr/reset')) {
    const contentType=String(req.headers?.['content-type']||'').split(';')[0];
    if(contentType!=='application/json') {reply(415,{error:'unsupported_media_type'});return true;}
    let body='';
    for await(const chunk of req) {
     body+=chunk.toString('utf8');
     if(Buffer.byteLength(body)>4096) {reply(413,{error:'payload_too_large'});return true;}
    }
    let payload;
    try{payload=JSON.parse(body);}catch{reply(400,{error:'invalid_json'});return true;}
    const params={authorization:'Bearer '+authorization,staffId:payload.staffId,date:payload.date,field:payload.field};
    const result=path==='/internal/hr/override'
      ? await operations.update({...params,value:payload.value})
      : await operations.reset(params);
    reply(200,result);return true;
   }
   reply(404,{error:'not_found'});return true;
  }catch(error){
   const code=error?.message;
   const status=code==='UNAUTHENTICATED'?401:code==='PERMISSION_DENIED'?403:
    ['INVALID_KEY','INVALID_FIELD'].includes(code)?400:503;
   if(status===503) {
     const stage=['HR_DIAGNOSTIC_AUTH','HR_DIAGNOSTIC_SOURCE','HR_DIAGNOSTIC_OVERRIDES'].includes(code)?code:'HR_DIAGNOSTIC_OTHER';
     // Only allowlisted stage and numeric error metadata. NEVER log error objects/messages, tokens or records.
     const upstreamStatus=Number(error?.cause?.code||error?.cause?.response?.status);
     const safeStatus=[400,401,403,404,429,500,502,503,504].includes(upstreamStatus)?upstreamStatus:'unknown';
     console.error('PRIVATE_HR_FAILURE',stage,'upstream_http',safeStatus);
   }
   reply(status,{error:status===503?'service_unavailable':code.toLowerCase()});
   return true;
  }
 };
}
