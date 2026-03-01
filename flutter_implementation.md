# ITM-HR Flutter & Firebase Implementation Guide

This guide provides the Firebase schema, Flutter CRUD logic, and OCR integration for your mobile application.

## 1. Data Extraction (OCR to JSON)
Using Gemini AI, we extract structured data from payroll images.

### Sample JSON Output:
```json
[
  {
    "serial_no": "1",
    "activity": "ရေပြောင်းလုပ်ငန်း",
    "duration": "1 Day",
    "name": "ဦးလှမောင်",
    "working_hours": 8,
    "total_days": 1,
    "rate": 15000,
    "meal_allowance": 2000,
    "total": 17000,
    "net_pay": 17000,
    "advance": 5000,
    "balance": 12000
  }
]
```

## 2. Firebase Database Schema (Firestore)

### Collection: `labourers`
- `id`: String (Document ID)
- `name`: String
- `status`: String ("Active" | "Inactive")
- `position`: String
- `department`: String
- `created_at`: Timestamp

### Collection: `payroll_records`
- `id`: String (Document ID)
- `serial_no`: String
- `activity`: String
- `duration`: String
- `name`: String
- `working_hours`: Number
- `total_days`: Number
- `rate`: Number
- `meal_allowance`: Number
- `total`: Number
- `net_pay`: Number
- `advance`: Number
- `balance`: Number
- `signature_url`: String (Firebase Storage URL)
- `created_at`: Timestamp

### Collection: `attendance`
- `id`: String
- `labourer_id`: String (Reference)
- `name`: String
- `check_in`: Timestamp
- `check_out`: Timestamp
- `actual_hours`: Number
- `location`: GeoPoint
- `date`: String (YYYY-MM-DD)

---

## 3. Flutter CRUD Logic (Dart)

### Dependencies (pubspec.yaml):
```yaml
dependencies:
  cloud_firestore: ^4.14.0
  firebase_core: ^2.24.2
  google_generative_ai: ^0.2.0
```

### CRUD Service Implementation:
```dart
import 'cloud_firestore/cloud_firestore.dart';

class PayrollService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  // CREATE
  Future<void> addRecord(Map<String, dynamic> data) async {
    await _db.collection('payroll_records').add({
      ...data,
      'created_at': FieldValue.serverTimestamp(),
    });
  }

  // READ
  Stream<List<Map<String, dynamic>>> getRecords() {
    return _db.collection('payroll_records')
        .orderBy('created_at', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs.map((doc) => {
          'id': doc.id,
          ...doc.data()
        }).toList());
  }

  // UPDATE
  Future<void> updateRecord(String id, Map<String, dynamic> data) async {
    await _db.collection('payroll_records').doc(id).update(data);
  }

  // DELETE
  Future<void> deleteRecord(String id) async {
    await _db.collection('payroll_records').doc(id).delete();
  }
}
```

### OCR Logic with Gemini (Flutter):
```dart
import 'package:google_generative_ai/google_generative_ai.dart';

class OCRService {
  final model = GenerativeModel(model: 'gemini-1.5-flash', apiKey: 'YOUR_API_KEY');

  Future<String?> extractData(List<int> imageBytes) async {
    final prompt = TextPart("Extract all payroll records from this image into a JSON array.");
    final imagePart = DataPart('image/jpeg', Uint8List.fromList(imageBytes));
    
    final response = await model.generateContent([
      Content.multi([prompt, imagePart])
    ]);
    
    return response.text;
  }
}
```
