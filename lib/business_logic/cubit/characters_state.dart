part of 'characters_cubit.dart';

@immutable
abstract class CharactersState {}

class CharactersInitial extends CharactersState {}


class CharactersLoaded extends CharactersState {
  final List<Character> servicesProviders;

  CharactersLoaded(this.servicesProviders);
}

class QuotesLoaded extends CharactersState {
  final List<Quote> quotes;

  QuotesLoaded(this.quotes);
}

