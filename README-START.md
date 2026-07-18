# Nasza Legenda — etap 0.5

To pierwszy prototyp formy docelowej: **interaktywny serial 2D**, a nie tekstowa gra.

## Co zawiera

- animowane sceny 2D z postaciami reprezentującymi 2–6 uczestników;
- narrator i napisy;
- muzyczne motywy oraz efekty generowane w przeglądarce;
- role zależne od uczestników;
- poszukiwanie prawdziwych przedmiotów w otoczeniu;
- automatyczny wybór Kotwicy;
- tajne słowa każdej osoby;
- zadanie pamięciowe;
- prawdziwe rozgałęzienie fabuły: zaufanie Cieniowi albo zabezpieczenie portalu;
- wspólny portal dotykowy;
- osobisty artefakt i cliffhanger;
- animowany film podsumowujący oraz plakat PNG;
- ankietę i eksport wyniku JSON;
- działanie offline po pierwszym otwarciu.

## Test lokalny na Windows

1. Rozpakuj ZIP.
2. Otwórz folder `nasza-legenda-0.5`.
3. Kliknij dwa razy `START_LOCAL.bat`.
4. Nie zamykaj czarnego okna.
5. Aplikacja powinna otworzyć się pod adresem:

   `http://localhost:8005`

## Aktualizacja obecnego repozytorium GitHub

1. Wejdź do repozytorium `nasza-legenda-pro-v04`.
2. Otwórz `Code` → `Add file` → `Upload files`.
3. Przeciągnij **zawartość** folderu `nasza-legenda-0.5`, nie sam folder.
4. Potwierdź zastąpienie plików i kliknij `Commit changes`.
5. Odczekaj 1–3 minuty.
6. Otwórz dotychczasowy adres GitHub Pages.
7. W nagłówku powinno być: `INTERAKTYWNY SERIAL · ETAP 0.5`.

Gdy telefon pokazuje starą wersję:

1. otwórz stronę w zwykłym Chrome;
2. odśwież ją dwa razy;
3. w razie potrzeby usuń dane witryny albo otwórz link w trybie incognito;
4. dopiero potem ponownie dodaj aplikację do ekranu głównego.

## Pierwszy test

Najpierw przejdź cały odcinek sam, żeby wykryć błąd techniczny. Następnie daj go Ewie bez wyjaśnień i sprawdź, czy własnymi słowami potrafi powiedzieć:

- co zniknęło;
- po co szukali przedmiotów;
- czym była Kotwica;
- kim był Cień;
- dlaczego trzeba było zapisać pierwszy krok.

Po teście pobierz plik `wynik-nasza-legenda-05-....json`.

## Uczciwe ograniczenia etapu 0.5

- postacie są stylizowanymi figurami 2D, a nie jeszcze realistycznymi bohaterami AI;
- głos nadal korzysta z lektora dostępnego w telefonie lub komputerze;
- film podsumowujący jest animacją w aplikacji i plakatem PNG, nie pełnym wygenerowanym filmem z naturalnymi postaciami;
- to działający prototyp kierunku produktu, który ma teraz zostać oceniony przez różne grupy.
