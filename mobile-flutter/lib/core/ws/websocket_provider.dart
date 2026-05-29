import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../auth/auth_provider.dart';
import '../constants/api_constants.dart';

typedef WsHandler = void Function(Map<String, dynamic> msg);

enum WsStatus { disconnected, connecting, connected }

class WsState {
  final WsStatus status;
  const WsState(this.status);
}

final websocketProvider =
    StateNotifierProvider<WebSocketNotifier, WsState>((ref) {
  final notifier = WebSocketNotifier(ref);
  ref.listen(authProvider, (prev, next) {
    if (next.user != null && prev?.user == null) {
      notifier.connect();
    } else if (next.user == null && prev?.user != null) {
      notifier.disconnect();
    }
  });
  return notifier;
});

class WebSocketNotifier extends StateNotifier<WsState> {
  final Ref _ref;
  WebSocketChannel? _channel;
  Timer? _pingTimer;
  Timer? _reconnectTimer;
  int _retryDelay = 1;
  bool _intentionalClose = false;
  final List<WsHandler> _handlers = [];

  WebSocketNotifier(this._ref) : super(const WsState(WsStatus.disconnected));

  void connect() {
    if (state.status == WsStatus.connecting ||
        state.status == WsStatus.connected) {
      return;
    }
    _intentionalClose = false;
    _doConnect();
  }

  Future<void> _doConnect() async {
    final token = await _ref.read(apiClientProvider).getStoredAccessToken();
    if (token == null) { return; }

    state = const WsState(WsStatus.connecting);
    final wsUrl = kApiUrl
        .replaceFirst('https://', 'wss://')
        .replaceFirst('http://', 'ws://');

    try {
      // Backend authenticates the WS upgrade by reading the JWT from a
      // Sec-WebSocket-Protocol value prefixed with "pdv.token." (RFC 6455).
      _channel = WebSocketChannel.connect(
        Uri.parse('$wsUrl/v1/ws'),
        protocols: ['pdv.token.$token'],
      );
      await _channel!.ready;
      state = const WsState(WsStatus.connected);
      _retryDelay = 1;

      _pingTimer = Timer.periodic(const Duration(seconds: 25), (_) {
        _channel?.sink.add('ping');
      });

      _channel!.stream.listen(
        (data) {
          if (data == 'pong') return;
          try {
            final msg = jsonDecode(data as String) as Map<String, dynamic>;
            for (final h in List.of(_handlers)) {
              h(msg);
            }
          } catch (_) {}
        },
        onDone: _onClose,
        onError: (_) => _onClose(),
      );
    } catch (_) {
      _onClose();
    }
  }

  void _onClose() {
    _pingTimer?.cancel();
    _channel = null;
    state = const WsState(WsStatus.disconnected);
    if (!_intentionalClose) _scheduleReconnect();
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(Duration(seconds: _retryDelay), () {
      _retryDelay = (_retryDelay * 2).clamp(1, 30);
      _doConnect();
    });
  }

  void disconnect() {
    _intentionalClose = true;
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _channel = null;
    state = const WsState(WsStatus.disconnected);
  }

  void subscribe(WsHandler handler) => _handlers.add(handler);
  void unsubscribe(WsHandler handler) => _handlers.remove(handler);

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
}
