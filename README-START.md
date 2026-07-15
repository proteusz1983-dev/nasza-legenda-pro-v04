# Nasza Legenda — pilot badawczy v0.4.2

## Najważniejsza zmiana

Przed rozpoczęciem można wybrać **od 2 do 6 uczestników**. Nie jest to wyłącznie dodatkowe pole w formularzu — każda dodana osoba bierze udział w historii.

Każdy uczestnik otrzymuje:

- własne imię lub pseudonim, zainteresowanie i opcjonalny wiek;
- osobną rolę fabularną;
- własne zadanie podczas szukania przedmiotów;
- własny przedmiot analizowany przez Kronikę;
- osobny tajny wybór słowa;
- osobne pytanie końcowe: „Czy chcesz Odcinek 2?”.

Kotwica Czasu jest wybierana spośród przedmiotów wszystkich uczestników. Zwiastun, finał i plik JSON zapisują pełny skład grupy.

## Obsługiwane grupy

- 2 osoby — para, rodzic i dziecko, rodzeństwo;
- 3–4 osoby — rodzina lub mała grupa przyjaciół;
- 5–6 osób — większa rodzina, grupa znajomych lub współpracowników.

Rytuał portalu działa również w większej grupie: wszyscy dotykają Kotwicy lub trzymają dłoń przy niej, a dwie osoby obsługują ekran telefonu.

## Aktualizacja na GitHub Pages

1. Rozpakuj ZIP.
2. Wejdź do repozytorium `nasza-legenda-pro-v04`.
3. Wybierz **Add file → Upload files**.
4. Przeciągnij zawartość folderu `nasza-legenda-pro-v0.4.2`, nie sam folder.
5. Zatwierdź przez **Commit changes**.
6. Odczekaj 1–3 minuty.
7. Otwórz aplikację i sprawdź, czy w nagłówku widnieje `v0.4.2`.

Gdy telefon pokazuje poprzednią wersję, zamknij zainstalowaną aplikację, otwórz adres w zwykłym Chrome i odśwież stronę dwa razy. W ostateczności usuń dane witryny dla adresu GitHub Pages.

## Test przed wysłaniem linku innym

1. Wybierz 4 osoby.
2. Sprawdź, czy pojawiają się cztery zestawy pól.
3. Uruchom historię.
4. Na ekranie ról powinny pojawić się cztery różne role.
5. Każda osoba powinna dostać własne zadanie, przedmiot i tajny wybór.
6. Na końcu formularz oceny powinien zawierać osobne pytanie dla każdej osoby.

## Kontrola techniczna

- składnia JavaScript: PASS;
- manifest PWA: PASS;
- generowanie wszystkich scen dla grup 2, 3, 4, 5 i 6 osób: PASS;
- role, przedmioty, tajne wybory i formularze ocen dla 2–6 osób: PASS.
