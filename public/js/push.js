const Push = {
  _sw: null,
  _sub: null,
  _isCapacitor: !!(window.Capacitor?.isNativePlatform?.()),
  _fcmRegistered: false,

  async init() {
    if (this._isCapacitor) {
      // 앱: 이미 권한 있으면 토큰 갱신
      await this._initFCM(false);
    } else {
      // 브라우저: 서비스 워커 등록
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        this._sw = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        this._sub = await this._sw.pushManager.getSubscription();
        if (this._sub) await this._sendSubToServer(this._sub);
      } catch (e) { console.warn('SW 등록 실패:', e); }
    }
  },

  async requestPermission() {
    if (this._isCapacitor) {
      return await this._initFCM(true);
    } else {
      return await this._requestWebPush();
    }
  },

  // ── 안드로이드 앱 (FCM) ──
  async _initFCM(requestPermission) {
    try {
      const { PushNotifications } = window.Capacitor.Plugins;
      if (!PushNotifications) return false;

      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt' && requestPermission) {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== 'granted') return false;
      if (permStatus.receive === 'granted' && !requestPermission) this._fcmRegistered = true;

      await PushNotifications.register();

      // 토큰 수신
      await PushNotifications.addListener('registration', async (token) => {
        try {
          await API.post('/api/push/fcm-token', { token: token.value });
          this._fcmRegistered = true;
        } catch (e) { console.error('FCM 토큰 저장 실패:', e); }
      });

      // 포그라운드 알림
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        Utils.showToast(`📣 ${notification.title}: ${notification.body}`);
      });

      return true;
    } catch (e) {
      alert('알림 설정 실패: ' + e.message);
      return false;
    }
  },

  // ── 브라우저/PWA (Web Push) ──
  async _requestWebPush() {
    if (!('serviceWorker' in navigator)) {
      alert('이 브라우저는 서비스 워커를 지원하지 않습니다.\n크롬 브라우저를 사용해 주세요.');
      return false;
    }
    if (!('PushManager' in window)) {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (isIOS) {
        alert('iPhone에서 알림을 받으려면:\n\n1. Safari 하단 공유 버튼(□↑) 탭\n2. "홈 화면에 추가" 선택\n3. 홈 화면의 앱 아이콘으로 실행\n4. 다시 알림 켜기 버튼을 눌러주세요.');
      } else {
        alert('이 브라우저는 푸시 알림을 지원하지 않습니다.\n크롬 브라우저를 사용해 주세요.');
      }
      return false;
    }
    try {
      if (!this._sw) this._sw = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    } catch (e) { alert('서비스 워커 등록 실패: ' + e.message); return false; }

    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm === 'denied') {
      alert('알림이 차단되어 있습니다.\n브라우저 설정에서 이 사이트의 알림을 허용해 주세요.');
      return false;
    }
    if (perm !== 'granted') return false;

    try {
      const { key } = await API.get('/api/push/vapid-public-key');
      if (!key) { alert('서버 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.'); return false; }
      this._sub = await this._sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this._urlBase64ToUint8Array(key),
      });
      await this._sendSubToServer(this._sub);
      return true;
    } catch (e) { alert('알림 구독 실패: ' + e.message); return false; }
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
    if (this._isCapacitor) return this._fcmRegistered;
    return !!this._sub && Notification.permission === 'granted';
  },

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  },
};
