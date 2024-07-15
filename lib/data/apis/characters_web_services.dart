import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../constants/strings.dart';

class CharactersWebServices {
  late Dio dio;

  CharactersWebServices() {
    BaseOptions options = BaseOptions(
      baseUrl: baseUrl,
      receiveDataWhenStatusError: true,
      connectTimeout: const Duration(seconds: 20), // 60 seconds,
      receiveTimeout: const Duration(seconds: 3),
    );
    dio = Dio(options);
  }

  Future<List<dynamic>> getAllCharacters() async {
    try {
      Response response = await dio.get('character');
      var data = response.data["results"];
      if (kDebugMode) {
        print(data.toString());
      }
      return data;
    } catch (e) {
      if (kDebugMode) {
        print(e.toString());
      }
      return [];
    }

  }

  Future<List<dynamic>> getCharacterQuotes(String charName) async {
    try {
      Response response = await dio.get('quote' , queryParameters: {'author' : charName});
      if (kDebugMode) {
        print(response.data.toString());
      }
      return response.data;
    } catch (e) {
      if (kDebugMode) {
        print(e.toString());
      }
      return [];
    }
  }



}