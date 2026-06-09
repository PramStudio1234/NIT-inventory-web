const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.js');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function inspect() {
    try {
        const snapshot = await db.collection('products').where('id', 'in', ['1495', '780']).get();
        snapshot.forEach(doc => {
            console.log(`Document ID: ${doc.id}`);
            console.log(JSON.stringify(doc.data(), null, 2));
        });
    } catch (err) {
        console.error(err);
    }
}

inspect();
