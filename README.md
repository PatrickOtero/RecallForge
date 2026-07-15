# RecallForge

> Transforme materiais de estudo em questionários interativos, revisáveis e prontos para praticar.

O **RecallForge** é uma aplicação web criada para converter conteúdos estruturados em experiências de estudo mais objetivas. A plataforma recebe arquivos ou textos, identifica perguntas e respostas, permite revisar o conteúdo importado e gera diferentes modos de prática.

O projeto foi pensado para reduzir o trabalho manual de montar questionários, preservando o controle do usuário sobre o material final.

<p align="center">
  <img src="public/recallforge-dashboard.png" alt="Tela principal do RecallForge" width="100%">
</p>



---

## Visão geral

Com o RecallForge, o usuário pode:

- importar materiais em formatos como `.txt`, `.pdf` e `.docx`;
- colar conteúdo diretamente na aplicação;
- revisar perguntas antes de adicioná-las ao material;
- praticar o mesmo conteúdo em diferentes modos;
- alternar entre tipos de questão sem reenviar o arquivo;
- utilizar questionários com múltipla escolha, verdadeiro ou falso, associação e flashcards;
- manter o conteúdo organizado em uma interface simples e responsiva.

---

## Principais recursos

### Importação de materiais

A aplicação aceita conteúdos enviados por arquivo ou texto colado, preservando acentuação e estrutura sempre que possível.

Formatos suportados:

- TXT
- PDF
- DOCX
- Texto colado

### Revisão antes da importação

Antes de adicionar as questões ao material, o usuário pode conferir o conteúdo reconhecido, corrigir inconsistências e aprovar apenas o que deseja utilizar.

### Modos de estudo

O mesmo material pode ser praticado em diferentes formatos:

- **Múltipla escolha**
- **Verdadeiro ou falso**
- **Associação**
- **Flashcards**
- **Revelar resposta**

### Questionários estruturados

O RecallForge reconhece blocos de conteúdo identificados por tipo.

Exemplo:

```txt
[MULTIPLA ESCOLHA]
P: Qual é a capital do Brasil?
A) Rio de Janeiro
B) Brasília
C) São Paulo
D) Salvador
Gabarito: B

[VERDADEIRO OU FALSO]
Afirmação: Brasília é a capital do Brasil.
Gabarito: Verdadeiro

[ASSOCIACAO]
Instrução: Associe cada país à sua capital.
1. Brasil => Brasília
2. Argentina => Buenos Aires
3. Chile => Santiago

[FLASHCARD]
Frente: Qual é a capital do Brasil?
Verso: Brasília
```

---

## Fluxo de uso

1. O usuário envia um arquivo ou cola um texto.
2. O sistema processa o conteúdo.
3. As questões encontradas são apresentadas para revisão.
4. O usuário aprova ou corrige o material.
5. O questionário é salvo.
6. O conteúdo pode ser praticado em diferentes modos de estudo.

---

## Tecnologias

### Front-end

- Next.js
- React
- TypeScript
- Tailwind CSS

### Dados e persistência

- Prisma ORM
- PostgreSQL

### Deploy

- Netlify

---

## Estrutura do projeto

```text
.
├── app/
│   ├── api/
│   ├── materials/
│   ├── quiz/
│   └── page.tsx
├── components/
├── lib/
├── prisma/
├── public/
├── styles/
├── types/
├── package.json
└── README.md
```

---

## Executando localmente

### Pré-requisitos

- Node.js 18 ou superior
- npm
- PostgreSQL

### Instalação

Clone o repositório:

```bash
git clone URL_DO_REPOSITORIO
cd recallforge
```

Instale as dependências:

```bash
npm install
```

Crie o arquivo de variáveis de ambiente:

```bash
cp .env.example .env
```

Configure a conexão com o banco:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/recallforge"
```

Gere o Prisma Client:

```bash
npx prisma generate
```

Aplique as migrations:

```bash
npx prisma migrate dev
```

Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

A aplicação estará disponível em:

```text
http://localhost:3000
```

---

## Scripts disponíveis

```bash
npm run dev
```

Inicia o servidor de desenvolvimento.

```bash
npm run build
```

Gera a versão de produção.

```bash
npm run start
```

Executa a aplicação compilada.

```bash
npm run lint
```

Executa a verificação de lint.

```bash
npx prisma studio
```

Abre a interface visual do Prisma para consulta dos dados.

---

## Deploy na Netlify

O projeto pode ser publicado na Netlify utilizando o suporte para aplicações Next.js.

Configuração recomendada:

```text
Build command: npm run build
Publish directory: .next
```

Também é necessário cadastrar as variáveis de ambiente utilizadas pela aplicação, especialmente:

```env
DATABASE_URL
```

Em projetos organizados dentro de uma subpasta, configure corretamente o diretório-base da aplicação no painel da Netlify.

---

## Objetivos do projeto

O RecallForge busca oferecer:

- criação rápida de materiais de estudo;
- menor dependência de edição manual;
- revisão humana antes da importação;
- reaproveitamento do mesmo conteúdo em vários modos;
- interface limpa e acessível;
- processamento previsível e confiável;
- suporte a questionários reais, inclusive materiais longos e variados.

---

## Roadmap

- aprimorar o reconhecimento de questionários extensos;
- aumentar a cobertura de diferentes padrões de formatação;
- melhorar a detecção de blocos de associação;
- ampliar as ferramentas de revisão;
- adicionar filtros e organização por matéria;
- permitir exportação de questionários;
- melhorar relatórios de progresso;
- ampliar a suíte de testes;
- aperfeiçoar acessibilidade e experiência mobile.

---

## Contribuição

Contribuições são bem-vindas.

1. Faça um fork do projeto.
2. Crie uma branch para sua alteração.

```bash
git checkout -b feature/minha-melhoria
```

3. Faça o commit.

```bash
git commit -m "feat: adiciona nova funcionalidade"
```

4. Envie a branch.

```bash
git push origin feature/minha-melhoria
```

5. Abra um Pull Request.

---

## Boas práticas

- mantenha o código tipado;
- preserve os padrões existentes;
- evite alterações estruturais desnecessárias;
- adicione testes quando aplicável;
- descreva claramente o problema resolvido;
- mantenha a interface responsiva;
- não introduza dependências sem necessidade real.

---

## Status

O RecallForge está em desenvolvimento ativo.

A aplicação já possui fluxo funcional de importação, revisão e geração de questionários, enquanto continua evoluindo para reconhecer materiais cada vez mais variados com maior precisão.

---

## Licença

Defina aqui a licença escolhida para o projeto.

Exemplo:

```text
MIT License
```

---

## Autor

Desenvolvido por **Patrick Otero**.

---

<p align="center">
  <strong>RecallForge</strong><br>
  Estude melhor. Revise com mais eficiência.
</p>
