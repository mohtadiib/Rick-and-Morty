import 'package:bloc/bloc.dart';
import 'package:meta/meta.dart';

import '../../data/models/services_provider.dart';
import '../../data/models/quote.dart';
import '../../data/repository/characters_repository.dart';

part 'characters_state.dart';

class CharactersCubit extends Cubit<CharactersState> {
  final CharactersRepository charactersRepository;
  CharactersCubit(this.charactersRepository) : super(CharactersInitial());

  void getAllCharacters() {
    charactersRepository.getAllCharacters().then((servicesProviders) {
      emit(CharactersLoaded(servicesProviders));
    });
  }

  void getQuotes(String charName) {
    charactersRepository.getCharacterQuotes(charName).then((quotes) {
      emit(QuotesLoaded(quotes));
    });
  }
}