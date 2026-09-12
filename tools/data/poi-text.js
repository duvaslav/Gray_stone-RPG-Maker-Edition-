"use strict";
// What Leonard finds at each search point, and what he finds on a second look.
// The second look must never be a dead "nothing here": it should read as the
// same object seen again, so re-examining feels deliberate rather than broken.
module.exports = {
  text: {
    poi_hall_portraits: {
      first: ["Портреты Грейстоунов висят ровным рядом.", "Под одним — табличка перевёрнута."],
      again: ["Портреты. Вы уже смотрели на них", "дольше, чем следовало."],
    },
    poi_hall_keys: {
      first: ["Доска с ключами. Один крючок пуст,", "и пыль вокруг него стёрта."],
      again: ["Крючок всё так же пуст."],
    },
    poi_study_desk: {
      first: ["Ваш стол. Бумаги лежат не так,", "как вы их оставили."],
      again: ["Больше на столе ничего нет."],
    },
    poi_library_catalog: {
      first: ["Каталог выдачи книг.", "Последняя запись оборвана."],
      again: ["Записи вы уже прочли."],
    },
    poi_archive_medical: {
      first: ["Медицинский журнал Элеоноры.", "Одного листа не хватает."],
      again: ["Журнал вы уже осмотрели."],
    },
    poi_archive_grey: {
      first: ["Серый реестр. Имена, даты, суммы —", "и почерк меняется на середине."],
      again: ["Реестр вы уже просмотрели."],
    },
    poi_dining_service: {
      first: ["Сервировочный шкаф.", "Один прибор не на месте."],
      again: ["Шкаф вы уже осмотрели."],
    },
    poi_kitchen_ledger: {
      first: ["Книга закупок. Травы заказаны", "в количестве, которого кухня не просила."],
      again: ["Книгу вы уже читали."],
    },
    poi_laundry_baskets: {
      first: ["Корзины с бельём.", "На одной манжете — тёмное пятно."],
      again: ["Бельё вы уже перебрали."],
    },
    poi_laundry_schedule: {
      first: ["График смен. Одна подпись", "поставлена другой рукой."],
      again: ["График вы уже изучили."],
    },

    // MAP_030 upper floor
    poi_hero_bed: {
      first: ["Ваша постель. Под изголовьем —", "след от чего-то плоского.", "Его вынули недавно."],
      again: ["Под изголовьем пусто."],
    },
    poi_maids_rooms: {
      first: ["Комнаты горничных.", "Шесть одинаковых кроватей —", "и шесть очень разных порядков."],
      again: ["Вы уже прошли по комнатам.", "Дважды этого делать не стоит."],
    },
    poi_guest_preparation: {
      first: ["Комнату готовят к приезду.", "Бельё сменили, но цветы", "поставили дважды."],
      again: ["Комната готова. Слишком готова."],
    },

    // MAP_040 basement
    poi_wine_log: {
      first: ["Журнал винной кладовой.", "Одна бутылка списана", "за день до того, как её открыли."],
      again: ["Журнал вы уже сверили."],
    },

    // MAP_050 chapel
    poi_chapel_register: {
      first: ["Журнал посещений часовни.", "Ночные записи идут без имён."],
      again: ["Журнал вы уже читали."],
    },
    poi_chapel_candles: {
      first: ["Подсвечники у алтаря.", "Воск накапан свежий, но служба", "была три дня назад."],
      again: ["Воск вы уже осмотрели."],
    },

    // MAP_060 secret passage
    poi_passage_dust: {
      first: ["Пыль на полу хода потревожена.", "След узкий и недавний."],
      again: ["След вы уже разглядели."],
    },
    poi_underground_cache: {
      first: ["Ниша в стене.", "Здесь что-то лежало — и лежало долго."],
      again: ["Ниша пуста."],
    },
    poi_chapel_branch_wax: {
      first: ["Застывший воск на камне.", "Кто-то ходил здесь со свечой."],
      again: ["Воск вы уже видели."],
    },

    // MAP_010 exterior
    poi_stable_tack: {
      first: ["Конюшенная сбруя.", "Одно седло влажное изнутри."],
      again: ["Сбрую вы уже осмотрели."],
    },
    poi_back_gate_tracks: {
      first: ["У задней калитки — следы.", "Идут наружу и обратно."],
      again: ["Следы вы уже прочли."],
    },
    poi_south_soil: {
      first: ["Земля в южном саду перекопана.", "Не по сезону."],
      again: ["Землю вы уже осмотрели."],
    },
  },

  // Search points that are marks ON THE GROUND, not objects standing on it.
  // These are laid below the player and passable: a blocking event in a
  // one-tile-wide passage would cut the passage in two, and "dust on the floor"
  // is not something you walk around.
  floorLevel: new Set([
    "poi_passage_dust", "poi_back_gate_tracks", "poi_south_soil",
  ]),

  // Graphic each search point carries. Interactive furniture is the EVENT, so
  // there is exactly one object in the cell.
  tile: {
    poi_hall_portraits: "PAINTING", poi_hall_keys: "CABINET", poi_study_desk: "DESK",
    poi_library_catalog: "BOOKSHELF", poi_archive_medical: "CABINET", poi_archive_grey: "CABINET",
    poi_dining_service: "CABINET", poi_kitchen_ledger: "COUNTER",
    poi_laundry_baskets: "CRATE", poi_laundry_schedule: "COUNTER",
    poi_hero_bed: "CABINET", poi_maids_rooms: "CABINET", poi_guest_preparation: "CABINET",
    poi_wine_log: "BARREL",
    poi_chapel_register: "BOOKSHELF", poi_chapel_candles: "CABINET",
    poi_passage_dust: "CRATE", poi_underground_cache: "CRATE", poi_chapel_branch_wax: "CRATE",
    poi_stable_tack: "CRATE", poi_back_gate_tracks: "CRATE", poi_south_soil: "CRATE",
  },
};
