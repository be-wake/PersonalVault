/// A saved address. `isCurrent` marks the user's primary address.
class AddressData {
  final String id;
  final String? label;
  final String? name;
  final String? line1;
  final String? line2;
  final String? city;
  final String? state;
  final String? postal;
  final String? country;
  final bool isCurrent;

  const AddressData({
    required this.id,
    this.label,
    this.name,
    this.line1,
    this.line2,
    this.city,
    this.state,
    this.postal,
    this.country,
    this.isCurrent = false,
  });

  factory AddressData.fromJson(Map<String, dynamic> json) => AddressData(
        id: json['id'] as String,
        label: json['type'] as String?,   // backend names the label field "type"
        name: json['name'] as String?,
        line1: json['line1'] as String?,
        line2: json['line2'] as String?,
        city: json['city'] as String?,
        state: json['state'] as String?,
        postal: json['postal'] as String?,
        country: json['country'] as String?,
        isCurrent: json['isCurrent'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        if (label != null) 'label': label,
        if (name != null) 'name': name,
        if (line1 != null) 'line1': line1,
        if (line2 != null) 'line2': line2,
        if (city != null) 'city': city,
        if (state != null) 'state': state,
        if (postal != null) 'postal': postal,
        if (country != null) 'country': country,
      };
}
