class User {
  final String id;
  final String email;
  final String name;
  final String? createdAt;

  const User({
    required this.id,
    required this.email,
    required this.name,
    this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        email: json['email'] as String,
        name: json['name'] as String,
        createdAt: (json['createdAt'] ?? json['created_at']) as String?,
      );
}
