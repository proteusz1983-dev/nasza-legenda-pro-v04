# Nasza Legenda PRO v0.4 — uruchomienie

## Najszybciej lokalnie na Windows

1. Rozpakuj ZIP do osobnego folderu.
2. Kliknij dwukrotnie `START_LOCAL.bat`.
3. Przeglądarka powinna otworzyć `http://localhost:8004`.
4. Jeżeli nie otworzy się sama, wpisz ten adres ręcznie w Chrome.
5. Czarne okno musi pozostać otwarte podczas testu.
6. Zatrzymanie serwera: kliknij czarne okno i naciśnij `Ctrl+C`.

## Test na telefonie przez GitHub Pages

1. Utwórz publiczne repozytorium na GitHubie, np. `nasza-legenda-pro-test`.
2. Wgraj do głównego katalogu repozytorium wszystkie pliki z paczki oraz cały folder `icons`.
3. Wejdź w `Settings → Pages`.
4. Ustaw `Deploy from a branch`, gałąź `main`, folder `/(root)`.
5. Otwórz wygenerowany adres w Chrome na telefonie.
6. Menu Chrome `⋮ → Zainstaluj aplikację` lub `Dodaj do ekranu głównego`.
7. Otwórz aplikację raz online. Potem sprawdź ją w trybie samolotowym.

## Co testujemy

- czy historia naprawdę reaguje na przedmioty i słowa,
- czy zagadka pamięci jest ciekawa,
- czy Cień buduje napięcie,
- czy wybór odzyskanej godziny ma sens,
- czy rytuał dwóch palców robi efekt „wow”,
- czy po finale Iwona i Szymon chcą Odcinek 2,
- czy podsumowanie nadaje się do pokazania znajomym.

## Ważne ograniczenia prototypu

- Lektor korzysta z głosu zainstalowanego w urządzeniu. W ustawieniach startowych można wybrać najlepszy dostępny polski głos albo wyłączyć dźwięk.
- Eksport filmu to WebM. Docelowy produkt będzie generował MP4.
- Wszystkie dane pozostają lokalnie w przeglądarce.
- Nie ma jeszcze kont, płatności ani synchronizacji urządzeń.
