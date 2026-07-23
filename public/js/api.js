const API = {
  async request(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '서버 오류');
    return data;
  },
  get: (url) => API.request('GET', url),
  post: (url, body) => API.request('POST', url, body),
  put: (url, body) => API.request('PUT', url, body),
  delete: (url) => API.request('DELETE', url),
  patch: (url, body) => API.request('PATCH', url, body),
};
