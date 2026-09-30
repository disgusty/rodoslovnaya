import { emptyTree, newPerson, uid, useStore } from './store';
import type { Family, FamilyType, Gender, Person, TreeData } from './types';

export function buildDemo(): TreeData {
  const t = emptyTree('Соколовы и Кузнецовы');
  const P = (last: string, first: string, middle: string, g: Gender, b: string, d: string | null, extra: Partial<Person> = {}) => {
    const p = newPerson({
      lastName: last,
      firstName: first,
      middleName: middle,
      gender: g,
      living: d === null,
      birth: { date: b, place: extra.birth?.place ?? '' },
      death: { date: d ?? '', place: extra.death?.place ?? '' },
      ...extra,
    });
    p.birth = { date: b, place: extra.birth?.place ?? '' };
    t.people[p.id] = p;
    return p.id;
  };
  const F = (partners: string[], children: string[], date = '', type: FamilyType = 'married') => {
    const f: Family = { id: uid(), partners, children, type, date, place: '' };
    t.families[f.id] = f;
    return f.id;
  };

  const ivan = P('Соколов', 'Иван', 'Петрович', 'm', '1880', '1942', {
    birth: { date: '1880', place: 'с. Покровское, Тверская губ.' },
    occupation: 'Кузнец',
    burial: 'Покровское кладбище',
    bio: 'Родился в семье крестьянина. С 14 лет работал в кузнице, позже открыл собственную мастерскую.',
    events: [
      { id: uid(), date: '1902', title: 'Служба в армии', place: 'Тверь', description: 'Призван на действительную службу.' },
      { id: uid(), date: '1904', title: 'Венчание с Анной Беловой', place: 'Покровская церковь', description: '' },
    ],
  });
  const anna = P('Соколова', 'Анна', 'Михайловна', 'f', '1884', '1960', { maidenName: 'Белова' });
  const nikolaiK = P('Кузнецов', 'Николай', 'Фёдорович', 'm', '1879', '1941', { occupation: 'Плотник' });
  const evdokia = P('Кузнецова', 'Евдокия', 'Ивановна', 'f', '1882', '1950');

  const petr = P('Соколов', 'Пётр', 'Иванович', 'm', '12.05.1905', '1978', { occupation: 'Инженер-механик' });
  const maria = P('Кузнецова', 'Мария', 'Ивановна', 'f', '1908', '1995', { maidenName: 'Соколова', occupation: 'Учитель' });
  const alexey = P('Кузнецов', 'Алексей', 'Николаевич', 'm', '1904', '1943', {
    bio: 'Погиб на фронте в 1943 году.',
    death: { date: '1943', place: 'под Курском' },
  });
  const elena = P('Соколова', 'Елена', 'Васильевна', 'f', '1910', '1990', { maidenName: 'Орлова' });

  const viktor = P('Соколов', 'Виктор', 'Петрович', 'm', '1935', '2010', { occupation: 'Врач' });
  const galina = P('Лебедева', 'Галина', 'Петровна', 'f', '1938', null, { maidenName: 'Соколова' });
  const boris = P('Лебедев', 'Борис', 'Андреевич', 'm', '1936', '2005');
  const lyudmila = P('Соколова', 'Людмила', 'Сергеевна', 'f', '1940', null);
  const nikolaiA = P('Кузнецов', 'Николай', 'Алексеевич', 'm', '1932', '2001');
  const annaA = P('Кузнецова', 'Анна', 'Алексеевна', 'f', '1936', '2019');
  const tamara = P('Кузнецова', 'Тамара', 'Григорьевна', 'f', '1934', null);
  const zina = P('Кузнецова', 'Зинаида', 'Павловна', 'f', '1938', '2015');

  const sergey = P('Соколов', 'Сергей', 'Викторович', 'm', '1965', null, { occupation: 'Программист', residence: 'Москва' });
  const olga = P('Соколова', 'Ольга', 'Николаевна', 'f', '1967', null);
  const andrey = P('Лебедев', 'Андрей', 'Борисович', 'm', '1962', null);
  const igor = P('Кузнецов', 'Игорь', 'Николаевич', 'm', '1958', null);
  const svetlana = P('Кузнецова', 'Светлана', 'Николаевна', 'f', '1965', null);
  const dmitry = P('Соколов', 'Дмитрий', 'Сергеевич', 'm', '1992', null);
  const katya = P('Соколова', 'Екатерина', 'Сергеевна', 'f', '1996', null);

  F([ivan, anna], [petr, maria], '1904');
  F([nikolaiK, evdokia], [alexey], '1902');
  F([petr, elena], [viktor, galina], '1933');
  F([alexey, maria], [nikolaiA, annaA], '1930');
  F([viktor, lyudmila], [sergey], '1962');
  F([boris, galina], [andrey], '1960');
  const div = F([nikolaiA, tamara], [igor], '1956', 'divorced');
  F([nikolaiA, zina], [svetlana], '1963');
  F([sergey, olga], [dmitry, katya], '1990');

  t.branches.push(
    { id: uid(), name: 'Род Соколовых', rootId: ivan, direction: 'descendants', color: '#1E88E5', comment: 'Линия по отцу. с. Покровское, Тверская губерния', visible: true },
    { id: uid(), name: 'Род Кузнецовых', rootId: nikolaiK, direction: 'descendants', color: '#E53935', comment: 'Плотники из Весьегонского уезда', visible: true },
  );
  t.links[`s:${div}`] = { color: '#757575', comment: 'Развод в 1961 г.' };
  return t;
}

export function loadDemo() {
  useStore.getState().replaceTree(buildDemo());
}
