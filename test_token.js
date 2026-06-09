const { AccessToken } = require('livekit-server-sdk');

async function test() {
  const at = new AccessToken('APIu738Wcn25FFc','aswgyvfJf0HEP6Pq3fn5iSCsu8Zw7fe3deoa7yk31uiB',{identity:'test',ttl:'1h'});
  at.addGrant({roomJoin:true,room:'test',canPublish:true,canSubscribe:true});
  const token = await at.toJwt();
  console.log('Token-Typ:', typeof token);
  console.log('Token-Anfang:', token.substring(0, 40) + '...');
  console.log('Token-Länge:', token.length);
}
test().catch(e => console.log('FEHLER:', e.message));
