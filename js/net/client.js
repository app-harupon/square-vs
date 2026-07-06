// オンライン対戦用のシグナリング/中継サーバーとの接続を薄くラップするクライアント。
// マッチング成立後はWebRTCのDataChannelで対戦相手と直接通信し(サーバーはほぼ介さない)、
// P2P接続が確立するまでの間・あるいは確立できない回線環境では、同じ中継サーバー経由の
// 送受信に自動的にフォールバックする。ゲームルール自体は一切知らない。
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export class NetClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.pc = null;
    this.dataChannel = null;
    this.usingP2P = false;
    this.onMatched = null;
    this.onWaiting = null;
    this.onGameMessage = null; // 実際の対戦アクション(init/deployUpdate/state等)を受け取るコールバック
    this.onPeerLeft = null;
    this.onError = null;
    this.onDisconnected = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.addEventListener('open', () => {
        settled = true;
        resolve();
      });
      ws.addEventListener('message', (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'matched') {
          this._setupPeerConnection(msg.role === 'host');
          this.onMatched?.(msg);
        } else if (msg.type === 'waiting') {
          this.onWaiting?.();
        } else if (msg.type === 'action') {
          if (msg.data?.kind === 'rtc-offer' || msg.data?.kind === 'rtc-answer' || msg.data?.kind === 'rtc-ice') {
            this._handleSignal(msg.data);
          } else {
            // P2P接続がまだ整う前、あるいは確立できない回線での中継サーバー経由フォールバック
            this.onGameMessage?.(msg.data);
          }
        } else if (msg.type === 'peer_left') {
          this.onPeerLeft?.();
        } else if (msg.type === 'error') {
          this.onError?.(msg.message);
        }
      });
      ws.addEventListener('close', () => {
        if (!settled) {
          settled = true;
          reject(new Error('接続に失敗しました'));
        } else {
          this.onDisconnected?.();
        }
      });
      ws.addEventListener('error', () => {
        if (!settled) {
          settled = true;
          reject(new Error('接続に失敗しました'));
        }
      });
    });
  }

  // マッチング成立直後に呼ばれる。ホスト側がDataChannelを開き、以後は直接通信を試みる
  async _setupPeerConnection(isHost) {
    this.usingP2P = false;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) this._sendSignal({ kind: 'rtc-ice', candidate: e.candidate.toJSON() });
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        this.usingP2P = false; // 直接接続が切れた/成立しなかった場合は中継サーバー経由に戻す
      }
    };

    if (isHost) {
      const channel = pc.createDataChannel('game');
      this._bindDataChannel(channel);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this._sendSignal({ kind: 'rtc-offer', sdp: offer });
    } else {
      pc.ondatachannel = (e) => this._bindDataChannel(e.channel);
    }
  }

  _bindDataChannel(channel) {
    this.dataChannel = channel;
    channel.onopen = () => {
      this.usingP2P = true;
    };
    channel.onclose = () => {
      this.usingP2P = false;
    };
    channel.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.onGameMessage?.(msg);
    };
  }

  async _handleSignal(data) {
    if (!this.pc) return;
    try {
      if (data.kind === 'rtc-offer') {
        await this.pc.setRemoteDescription(data.sdp);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this._sendSignal({ kind: 'rtc-answer', sdp: answer });
      } else if (data.kind === 'rtc-answer') {
        await this.pc.setRemoteDescription(data.sdp);
      } else if (data.kind === 'rtc-ice') {
        await this.pc.addIceCandidate(data.candidate);
      }
    } catch {
      // シグナリングの前後関係がずれて失敗することがあるが、致命的ではないため無視して
      // 中継サーバー経由のフォールバックに任せる
    }
  }

  _sendSignal(data) {
    this.send({ type: 'action', data });
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  queueCasual(mode) {
    this.send({ type: 'queue', mode });
  }

  joinRoom(mode, code) {
    this.send({ type: 'room', mode, code });
  }

  cancel() {
    this.send({ type: 'cancel' });
  }

  // 実際の対戦アクション(init/deployUpdate/state等)の送信。P2Pが繋がっていればそちらを優先し、
  // 繋がっていなければ(接続中・不成立時とも)中継サーバー経由で送る
  sendGameMessage(data) {
    if (this.usingP2P && this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    } else {
      this.send({ type: 'action', data });
    }
  }

  leave() {
    this.send({ type: 'leave' });
    this.dataChannel?.close();
    this.pc?.close();
    this.dataChannel = null;
    this.pc = null;
    this.usingP2P = false;
  }

  disconnect() {
    this.dataChannel?.close();
    this.pc?.close();
    this.ws?.close();
    this.ws = null;
    this.dataChannel = null;
    this.pc = null;
    this.usingP2P = false;
  }
}
