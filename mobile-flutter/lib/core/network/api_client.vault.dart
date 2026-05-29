part of 'api_client.dart';

/// Vault CRUD endpoints: identity, address, payment cards, contacts.
extension ApiClientVault on ApiClient {
  // ── Identity ───────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getIdentity(String userId) async {
    final resp = await _dio.get('/v1/identity/$userId');
    return resp.data as Map<String, dynamic>;
  }

  Future<void> updateIdentity(String userId, Map<String, dynamic> data) async {
    await _dio.put('/v1/identity/$userId', data: data);
  }

  Future<Map<String, dynamic>> addDocument(
      String userId, Map<String, dynamic> data) async {
    final resp = await _dio.post('/v1/identity/$userId/documents', data: data);
    return resp.data as Map<String, dynamic>;
  }

  Future<void> updateDocument(
      String userId, String docId, Map<String, dynamic> data) async {
    await _dio.put('/v1/identity/$userId/documents/$docId', data: data);
  }

  Future<void> deleteDocument(String userId, String docId) async {
    await _dio.delete('/v1/identity/$userId/documents/$docId');
  }

  // ── Address ──────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getAddresses(String userId) async {
    final resp = await _dio.get('/v1/address/$userId');
    return (resp.data as Map<String, dynamic>)['addresses'] as List<dynamic>;
  }

  Future<Map<String, dynamic>> addAddress(
      String userId, Map<String, dynamic> data) async {
    final resp = await _dio.post('/v1/address/$userId', data: data);
    return resp.data as Map<String, dynamic>;
  }

  Future<void> updateAddress(
      String userId, String addrId, Map<String, dynamic> data) async {
    await _dio.put('/v1/address/$userId/$addrId', data: data);
  }

  Future<void> deleteAddress(String userId, String addrId) async {
    await _dio.delete('/v1/address/$userId/$addrId');
  }

  Future<void> setPrimaryAddress(String userId, String addrId) async {
    await _dio.put('/v1/address/$userId/$addrId/primary');
  }

  // ── Payment ──────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getCards(String userId) async {
    final resp = await _dio.get('/v1/payment/$userId/cards');
    return (resp.data as Map<String, dynamic>)['cards'] as List<dynamic>;
  }

  Future<Map<String, dynamic>> addCard(
      String userId, Map<String, dynamic> data) async {
    final resp = await _dio.post('/v1/payment/$userId/cards', data: data);
    return resp.data as Map<String, dynamic>;
  }

  Future<void> deleteCard(String userId, String cardId) async {
    await _dio.delete('/v1/payment/$userId/cards/$cardId');
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getContacts(String userId) async {
    final resp = await _dio.get('/v1/contacts/$userId');
    return (resp.data as Map<String, dynamic>)['contacts'] as List<dynamic>;
  }

  Future<Map<String, dynamic>> addContact(
      String userId, Map<String, dynamic> data) async {
    final resp = await _dio.post('/v1/contacts/$userId', data: data);
    return resp.data as Map<String, dynamic>;
  }

  Future<void> updateContact(
      String userId, String contactId, Map<String, dynamic> data) async {
    await _dio.put('/v1/contacts/$userId/$contactId', data: data);
  }

  Future<void> deleteContact(String userId, String contactId) async {
    await _dio.delete('/v1/contacts/$userId/$contactId');
  }
}
