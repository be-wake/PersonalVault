import 'package:dio/dio.dart';

/// Converts any caught exception into a short, user-facing message.
/// Never exposes raw Dio technical strings.
String friendlyError(Object e) {
  if (e is DioException) {
    final data = e.response?.data;

    // Backend envelope: { "error": { "code": "...", "message": "..." } }
    if (data is Map) {
      final inner = data['error'];
      if (inner is Map && inner['message'] is String) {
        return inner['message'] as String;
      }
      if (data['message'] is String) return data['message'] as String;
    }
    if (data is String && data.isNotEmpty && data.length < 200) return data;

    return switch (e.response?.statusCode) {
      400 => 'Invalid request.',
      401 => 'Unauthorised. Please sign in again.',
      403 => 'Access denied.',
      404 => 'Not found.',
      409 => 'Conflict — record already exists.',
      422 => 'Invalid data provided.',
      500 || 502 || 503 => 'Server error. Try again later.',
      _ when e.type == DioExceptionType.connectionTimeout ||
            e.type == DioExceptionType.receiveTimeout =>
        'Request timed out. Check your connection.',
      _ when e.type == DioExceptionType.connectionError =>
        'Cannot reach the server. Check your connection.',
      _ => 'Something went wrong. Please try again.',
    };
  }
  return 'Something went wrong. Please try again.';
}
