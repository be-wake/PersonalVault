class ContactsData {
  final String? phonePrimary;
  final String? phoneType;
  final String? emailSecondary;

  const ContactsData({
    this.phonePrimary,
    this.phoneType,
    this.emailSecondary,
  });

  factory ContactsData.fromJson(Map<String, dynamic> json) => ContactsData(
        phonePrimary: json['phonePrimary'] as String?,
        phoneType: json['phoneType'] as String?,
        emailSecondary: json['emailSecondary'] as String?,
      );

  Map<String, dynamic> toJson() => {
        if (phonePrimary != null) 'phonePrimary': phonePrimary,
        if (phoneType != null) 'phoneType': phoneType,
        if (emailSecondary != null) 'emailSecondary': emailSecondary,
      };
}
