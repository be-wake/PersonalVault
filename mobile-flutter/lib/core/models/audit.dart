/// A single entry in the user's tamper-evident audit trail.
class AuditEvent {
  final String id;
  final String eventType;
  final String? actorType;
  final String timestamp;
  final String? rpName;
  final String? label;
  final Map<String, dynamic>? metadata;

  const AuditEvent({
    required this.id,
    required this.eventType,
    this.actorType,
    required this.timestamp,
    this.rpName,
    this.label,
    this.metadata,
  });

  factory AuditEvent.fromJson(Map<String, dynamic> json) => AuditEvent(
        id: json['id'] as String,
        eventType: json['eventType'] as String,
        actorType: json['actorType'] as String?,
        timestamp: json['timestamp'] as String,
        rpName: (json['relyingParty'] as Map<String, dynamic>?)?['name'] as String?,
        label: json['label'] as String?,
        metadata: json['metadata'] as Map<String, dynamic>?,
      );
}
