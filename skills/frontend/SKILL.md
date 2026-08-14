---
name: frontend
description: Use ao alterar HTML/CSS/JS em frontend/ no dashboard/ERP 40º BPM/I (sem framework, sem build step). Cobre padrão de componente por função, fotos/avatares lazy, filtros/busca, tooltip customizado, confirmação de ação destrutiva e os pontos sem padrão único (loading/empty/erro, responsividade).
metadata:
  domain: erp-pm-40bpmi
  role: frontend
  scope: ui-implementation
  source: ERP_ENGINEERING_CONSTITUTION.md §8
  related-skills: erp-core, architecture, business-rules
---

# Frontend

Sem framework, sem build step — HTML/CSS/JS puro servido via `express.static`. Chart.js, PapaParse, Lucide Icons via CDN.

## Componentes

"Componente" aqui é uma função JS que retorna string HTML (template literal), injetada via `innerHTML`. Seguir esse padrão. Não introduzir lib de componentização (React/Vue/etc.) sem decisão explícita do proprietário — mudaria a stack inteira.

## Formulários

Validação client-side existe, mas nunca é a única camada — o backend sempre revalida (ver `backend/SKILL.md`).

## Tabelas/listas grandes

Padrão atual: carregar tudo do cache/API e filtrar em memória no cliente (compatível com a escala atual, ~350 PMs / milhares de ocorrências). Paginação real não é o padrão. `[A DEFINIR]` quando migrar para paginação de verdade se o volume crescer muito.

## Filtros e busca

- Busca com highlight de termo (`p1SearchInput` em `p1.js`) é o padrão de referência.
- Para seleção com dezenas+ de opções, preferir `<input list>` + `<datalist>` (digita e filtra ao vivo, mantém lista completa acessível) em vez de `<select>` puro — padrão recém-estabelecido (ver filtro de cursos no KPI Total Efetivo).

## Fotos / avatares

Padrão: `data-foto-re="<re>"` no elemento + carregamento em lote sob demanda (`p1LoadFotosVisiveis()`, busca só o que está de fato visível na tela, chamando `POST /api/p1/fotos/lote`). **Nunca** embutir a foto direto no HTML de uma lista grande — sempre usar o padrão lazy de lote existente, incluindo em telas novas que listam PMs (dropdown de busca, cards, tabelas). Bug real já corrigido: o dropdown de busca de PM renderizava só o avatar de iniciais (`p1AvatarSVG`) porque não seguia esse padrão — corrigido adicionando `data-foto-re` + chamada a `p1LoadFotosVisiveis()` após renderizar os resultados.

## Loading / empty / erro

**Sem padrão único e consistente identificado.** `[A DEFINIR]` se vale a pena propor e aplicar um padrão único antes de continuar espalhando variações ad hoc.

## Confirmações

Ações destrutivas (exclusão de usuário, reset de senha) já pedem confirmação no frontend. Manter esse padrão para toda ação irreversível nova — e sempre revalidar no backend também, nunca confiar só no `confirm()` do navegador.

## Tooltips

Preferir tooltip customizado via CSS (`.restr-tt`/`.restr-tt-wrap`) em vez do atributo `title` nativo quando a informação for importante — o `title` nativo tem delay de hover que faz a informação passar despercebida (achado real desta sessão, confirmado por inspeção DOM antes de decidir trocar).

## Responsividade / acessibilidade

Sem tratamento sistemático identificado (sem media queries abrangentes, sem ARIA revisado). Uso real parece ser desktop (estação do batalhão). `[A DEFINIR]` se isso é requisito ativo do proprietário.

## Feedback ao usuário

Mensagens de erro da API (`{error: "..."}`) devem ser exibidas de forma legível, não só logadas no console. Sem helper central de toast/alerta identificado. `[A DEFINIR]` se vale padronizar.
