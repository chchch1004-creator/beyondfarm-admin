const Push = {
  _sw: null,
  _sub: null,

  async init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      this._sw = await navigator.serviceWorker.register('/sw.js');
      // 이미 구독 중이면 서버에 갱신
      this._sub = await this._sw.pushManager.getSubscription();
      if (this._sub) await this._sendSubToServer(this._sub);
    } catch (e) { console.warn('SW 등록 실패:', e); }
  },

  async requestPermission() {
    if (!('serviceWorker' in navigator)) {
      alert('이 브라우저는 푸시 알림을 지원하지 않습니다.');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;

    try {
      const { key } = await API.get('/api/push/vapid-public-key');
      this._sub = await this._sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this._urlBase64ToUint8Array(key),
      });
      await this._sendSubToServer(this._sub);
      return true;
    } catch (e) {
      console.error('구독 실패:', e);
      return false;
    }
  },

  async _sendSubToServer(sub) {
    const j = sub.toJSON();
    try {
      await API.post('/api/push/subscribe', {
        endpoint: j.endpoint,
        keys: { p256dh: j.keys.p256dh, auth: j.keys.auth },
      });
    } catch {}
  },

  isSubscribed() {
    return !!this._sub && Notification.permission === 'granted';
  },

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  },
};
