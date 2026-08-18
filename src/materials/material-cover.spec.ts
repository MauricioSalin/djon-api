import { firstMaterialImage } from './material-cover';

describe('firstMaterialImage', () => {
  it('usa a primeira imagem do artigo quando existe', () => {
    const body = [
      '<p>Introdução</p>',
      '<img src="/api/v1/files/primeira" alt="Primeira">',
      '<img src="https://cdn.example.com/segunda.webp" alt="Segunda">',
    ].join('');

    expect(firstMaterialImage(body)).toBe('/api/v1/files/primeira');
  });

  it('aceita atributos em outra ordem e aspas simples', () => {
    expect(
      firstMaterialImage(
        "<img alt='Capa do artigo' src='https://cdn.example.com/capa.jpg'>",
      ),
    ).toBe('https://cdn.example.com/capa.jpg');
  });

  it('não cria capa quando o artigo não tem imagem', () => {
    expect(
      firstMaterialImage('<h2>Material somente com texto</h2>'),
    ).toBeUndefined();
  });
});
