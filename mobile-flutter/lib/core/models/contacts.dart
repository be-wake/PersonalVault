class ContactPerson {
  final String id;
  final String? name;
  final String? phonePrimary;
  final String? phoneType;
  final String? emailSecondary;

  const ContactPerson({
    required this.id,
    this.name,
    this.phonePrimary,
    this.phoneType,
    this.emailSecondary,
  });

  factory ContactPerson.fromJson(Map<String, dynamic> json) => ContactPerson(
        id: json['id'] as String,
        name: json['name'] as String?,
        phonePrimary: json['phonePrimary'] as String?,
        phoneType: json['phoneType'] as String?,
        emailSecondary: json['emailSecondary'] as String?,
      );

  Map<String, dynamic> toJson() => {
        if (name != null) 'name': name,
        if (phonePrimary != null) 'phonePrimary': phonePrimary,
        if (phoneType != null) 'phoneType': phoneType,
        if (emailSecondary != null) 'emailSecondary': emailSecondary,
      };
}
