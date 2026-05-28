class PaymentCard {
  final String id;
  final String? cardType;
  final String last4;
  final String? expiryMmYy;
  final String? nickname;

  const PaymentCard({
    required this.id,
    this.cardType,
    required this.last4,
    this.expiryMmYy,
    this.nickname,
  });

  factory PaymentCard.fromJson(Map<String, dynamic> json) => PaymentCard(
        id: json['id'] as String,
        cardType: json['cardType'] as String?,
        last4: json['last4'] as String,
        expiryMmYy: json['expiryMmYy'] as String?,
        nickname: json['nickname'] as String?,
      );

  Map<String, dynamic> toJson() => {
        if (cardType != null) 'cardType': cardType,
        'last4': last4,
        if (expiryMmYy != null) 'expiryMmYy': expiryMmYy,
        if (nickname != null) 'nickname': nickname,
      };
}
