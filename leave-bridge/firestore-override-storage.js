/**
 * Firestore Admin SDK storage adapter. Server-side only.
 * Rules: privateHrLeave writes are denied to clients, backend uses IAM.
 * Each field is updated transactionally so independent edits cannot collide.
 */
export function firestoreOverrideStorage(db, appId) {
  if (!db || !appId) throw new Error('Firestore and app ID required');
  const collection=db.collection('artifacts').doc(appId).collection('privateHrLeave');
  const refFor=key => {
    if(!/^[A-Za-z0-9_-]{1,48}_20\d{2}-\d{2}-\d{2}$/.test(key))throw new Error('Invalid override key');
    return collection.doc(key);
  };
  return {
    async get(key) {
      const snapshot=await refFor(key).get();
      return snapshot.exists ? (snapshot.data()?.overrides || {}) : {};
    },
    async updateField(key,field,override,actorUid) {
      if(!['noteTime','reason'].includes(field))throw new Error('Invalid field');
      await db.runTransaction(async tx=>{
        const ref=refFor(key), snap=await tx.get(ref);
        const existing=snap.exists ? snap.data()?.overrides || {} : {};
        tx.set(ref,{overrides:{...existing,[field]:override},
          updatedBy:actorUid,updatedAt:new Date().toISOString()},{merge:true});
      });
    },
    async deleteField(key,field,actorUid) {
      if(!['noteTime','reason'].includes(field))throw new Error('Invalid field');
      await db.runTransaction(async tx=>{
        const ref=refFor(key), snap=await tx.get(ref);
        const overrides={...(snap.exists ? snap.data()?.overrides||{} : {})};
        delete overrides[field];
        tx.set(ref,{overrides,updatedBy:actorUid,updatedAt:new Date().toISOString()},{merge:true});
      });
    }
  };
}
