import {requireHrPrincipal} from './hr-authorization.js';
import {resolveAttendanceRow,resetFieldToSheet} from './override-policy.js';

const validDay = d => typeof d === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(d) &&
 !Number.isNaN(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const validStaff = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(id);
const validField = f => f === 'noteTime' || f === 'reason';

export function validateKey(staffId,date) {
 if(!validStaff(staffId)||!validDay(date)) throw new Error('INVALID_KEY');
 return staffId+'_'+date;
}
export function parseApprovedEmails(raw) {
 return new Set(String(raw||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
}
export async function authenticateHr(authHeader,verifyIdToken,approvedEmails) {
 const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(String(authHeader||''));
 if(!match) throw new Error('UNAUTHENTICATED');
 const claims = await verifyIdToken(match[1],true);
 return requireHrPrincipal({
  uid:claims.uid, email:claims.email, emailVerified:claims.email_verified === true,
  verified:true, anonymous:claims.firebase?.sign_in_provider === 'anonymous'
 }, approvedEmails);
}
/**
 * Storage adapter exposes get(key) and set(key, value), executes with server credentials.
 * Never return data in an unauthenticated route, logger or public Firestore collection.
 */
export function createPrivateHrOperations({readSource,storage,verifyIdToken,approvedEmails}) {
 async function authorized(token) {
   try { return await authenticateHr(token,verifyIdToken,approvedEmails); }
   catch(e) { if(['UNAUTHENTICATED','PERMISSION_DENIED'].includes(e?.message)) throw e;
     const error=new Error('HR_DIAGNOSTIC_AUTH');error.cause=e;throw error; }
 }
 return {
  async read({authorization,staffId,date}) {
   await authorized(authorization);
   const key=validateKey(staffId,date);
   let source;try {source=await readSource(staffId,date);}catch(e){const error=new Error('HR_DIAGNOSTIC_SOURCE');error.cause=e;throw error;}
   if(!source) return null;
   let manual;try{manual=await storage.get(key)||{};}catch(e){const error=new Error('HR_DIAGNOSTIC_OVERRIDES');error.cause=e;throw error;}
   return resolveAttendanceRow(source,manual);
  },
  async update({authorization,staffId,date,field,value}) {
   const actor=await authorized(authorization);
   const key=validateKey(staffId,date);
   if(!validField(field)||typeof value!=='string'||value.length>2000) throw new Error('INVALID_FIELD');
   if(!await readSource(staffId,date)) throw new Error('INVALID_KEY');
   await storage.updateField(key,field,{present:true,value},actor.uid);
   return {ok:true};
  },
  async reset({authorization,staffId,date,field}) {
   const actor=await authorized(authorization);
   const key=validateKey(staffId,date);
   if(!validField(field)) throw new Error('INVALID_FIELD');
   if(!await readSource(staffId,date)) throw new Error('INVALID_KEY');
   await storage.deleteField(key,field,actor.uid);
   return {ok:true};
  }
 };
}
