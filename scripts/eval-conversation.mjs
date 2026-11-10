import { randomUUID } from 'node:crypto';
const base = process.env.EVAL_BASE_URL || 'http://127.0.0.1:3001';
const flows = [
  ['original transcript', ['I would like to understand why the sales are going down', 'I want to understand the reason why the sales are going down the overall reason mentioned all the points that are responsible for this.', 'are you hard good', 'No, this is hardcoded.', 'Okay sure.', 'Yes.', 'Okay, thank you.']],
  ['correction and plan', ['We have no dispatch delays and all bestsellers are in stock; our impressions fell sharply.', 'Explain only the impact of visibility. Do not suggest a plan yet.', 'Create a recovery plan for the visibility issue.', 'No, do not save. Explain what information is missing.', 'Create a revised recovery plan focused on visibility and cancellations.', 'Okay sure.', 'Thank you.']],
];
let failures = 0;
for (const [name, messages] of flows) {
  const owner = 'live-eval-' + randomUUID();
  const post = async (path, body) => {
    const r = await fetch(base + path, { method:'POST', headers:{'content-type':'application/json','x-demo-session':owner},body:JSON.stringify(body) });
    const data = await r.json(); if (!r.ok) throw Error(JSON.stringify(data)); return data;
  };
  const start = await post('/api/agent/start', {language:'en-IN'});
  console.log(JSON.stringify({flow:name,start:start.assistantMessage,mode:start.session.mode}));
  for (const text of messages) {
    const t = Date.now(); const r = await post('/api/agent/turn', {sessionId:start.session.id,message:text});
    console.log(JSON.stringify({user:text,reply:r.assistantMessage,mode:r.session.mode,seconds:(Date.now()-t)/1000,pending:r.session.awaitingPlanConfirmation,keys:r.session.recommendedActions.map(a=>a.key),saved:r.actions.length,statements:r.session.statements.map(s=>({topic:s.topic,status:s.status,quote:s.statement}))}));
    if(r.session.mode !== 'ollama') failures++;
    if(/do not save/i.test(text) && r.actions.length) failures++;
    if(/^Thank|^Okay, thank/i.test(text) && r.session.awaitingPlanConfirmation) failures++;
    if(/Do not suggest a plan yet/.test(text) && r.session.awaitingPlanConfirmation) failures++;
    if(name === 'original transcript' && r.actions.length) failures++;
  }
  await post('/api/agent/end',{sessionId:start.session.id});
}
if(failures) {console.error(failures + ' live integration checks failed');process.exitCode=1;}
