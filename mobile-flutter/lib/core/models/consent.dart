class RelyingParty {
  final String id;
  final String name;
  final String? domain;
  final List<String> allowedScopes;

  const RelyingParty({
    required this.id,
    required this.name,
    this.domain,
    this.allowedScopes = const [],
  });

  factory RelyingParty.fromJson(Map<String, dynamic> json) => RelyingParty(
        id: json['id'] as String,
        name: json['name'] as String,
        domain: json['domain'] as String?,
        allowedScopes: (json['allowedScopes'] as List<dynamic>? ?? [])
            .map((s) => s as String)
            .toList(),
      );
}

class ConsentGrant {
  final String id;
  final String relyingPartyId;
  final List<String> scopes;
  final String? purpose;
  final String status;
  final String? grantedAt;
  final String? expiresAt;
  final String? revokedAt;
  final RelyingParty? rp;

  const ConsentGrant({
    required this.id,
    required this.relyingPartyId,
    required this.scopes,
    this.purpose,
    required this.status,
    this.grantedAt,
    this.expiresAt,
    this.revokedAt,
    this.rp,
  });

  bool get isActive => status == 'ACTIVE';
  bool get isRevoked => status == 'REVOKED';
  bool get isExpired => status == 'EXPIRED';

  factory ConsentGrant.fromJson(Map<String, dynamic> json) => ConsentGrant(
        id: json['id'] as String,
        relyingPartyId: json['relyingPartyId'] as String,
        scopes: (json['scopes'] as List<dynamic>? ?? [])
            .map((s) => s as String)
            .toList(),
        purpose: json['purpose'] as String?,
        status: json['status'] as String? ?? 'ACTIVE',
        grantedAt: json['grantedAt'] as String?,
        expiresAt: json['expiresAt'] as String?,
        revokedAt: json['revokedAt'] as String?,
        rp: json['rp'] != null
            ? RelyingParty.fromJson(json['rp'] as Map<String, dynamic>)
            : null,
      );
}

const kScopeLabels = <String, String>{
  'identity:read': 'Identity',
  'address:read': 'Address',
  'payment:read': 'Payment Cards',
  'contacts:read': 'Contacts',
};
