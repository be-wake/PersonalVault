class IdentityDocument {
  final String id;
  final String idType;
  final String idNumber;
  final String? updatedAt;

  const IdentityDocument({
    required this.id,
    required this.idType,
    required this.idNumber,
    this.updatedAt,
  });

  factory IdentityDocument.fromJson(Map<String, dynamic> json) => IdentityDocument(
        id: json['id'] as String,
        idType: json['idType'] as String,
        idNumber: json['idNumber'] as String,
        updatedAt: json['updatedAt'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'idType': idType,
        'idNumber': idNumber,
      };
}

class IdentityData {
  final String? firstName;
  final String? lastName;
  final String? emailPrimary;
  final String? dateOfBirth;
  final List<IdentityDocument> documents;

  const IdentityData({
    this.firstName,
    this.lastName,
    this.emailPrimary,
    this.dateOfBirth,
    this.documents = const [],
  });

  factory IdentityData.fromJson(Map<String, dynamic> json) => IdentityData(
        firstName: json['firstName'] as String?,
        lastName: json['lastName'] as String?,
        emailPrimary: json['emailPrimary'] as String?,
        dateOfBirth: json['dateOfBirth'] as String?,
        documents: (json['documents'] as List<dynamic>? ?? [])
            .map((d) => IdentityDocument.fromJson(d as Map<String, dynamic>))
            .toList(),
      );

  Map<String, dynamic> toJson() => {
        if (firstName != null) 'firstName': firstName,
        if (lastName != null) 'lastName': lastName,
        if (emailPrimary != null) 'emailPrimary': emailPrimary,
        if (dateOfBirth != null) 'dateOfBirth': dateOfBirth,
      };
}
