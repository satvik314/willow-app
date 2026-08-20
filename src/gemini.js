const MODEL = 'gemini-flash-latest';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';

export function getApiKey(){
  return localStorage.getItem('willow:gemini-key') || '';
}
export function setApiKey(key){
  if(key) localStorage.setItem('willow:gemini-key', key);
  else localStorage.removeItem('willow:gemini-key');
}

export async function askGemini(systemPrompt, messages){
  const key = getApiKey();
  if(!key) throw new Error('missing-key');

  const contents = messages.map(function(m){
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
  });

  const res = await fetch(ENDPOINT + '?key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: 1000 }
    })
  });

  if(res.status === 400 || res.status === 403){
    throw new Error('bad-key');
  }
  if(!res.ok){
    throw new Error('request-failed');
  }

  const data = await res.json();
  const candidate = (data.candidates || [])[0];
  const text = candidate && candidate.content && candidate.content.parts
    ? candidate.content.parts.map(function(p){ return p.text || ''; }).join('\n').trim()
    : '';
  if(!text) throw new Error('empty');
  return text;
}
