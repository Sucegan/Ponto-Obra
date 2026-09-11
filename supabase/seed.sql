-- Dados encontrados no obra.db original. Execute somente se quiser importar esse histórico.
insert into public.funcionarios (id, nome, cargo, valor_diaria, ativo)
values
    (1, 'Igor Sucegan', 'Operário', 180.00, true),
    (2, 'Pedrinho', 'Operário', 160.00, true),
    (3, 'Gustavo', 'Operário', 140.00, true)
on conflict (id) do update set
    nome = excluded.nome,
    cargo = excluded.cargo,
    valor_diaria = excluded.valor_diaria,
    ativo = excluded.ativo;

insert into public.ponto (id, data, funcionario_id, status)
values
    (1, '2026-08-31', 3, 'Trabalhou'),
    (2, '2026-08-31', 2, 'Falta'),
    (3, '2026-08-31', 1, 'Trabalhou'),
    (4, '2026-08-21', 3, 'Feriado'),
    (5, '2026-08-21', 1, 'Trabalhou'),
    (6, '2026-08-21', 2, 'Trabalhou')
on conflict (data, funcionario_id) do update set status = excluded.status, updated_at = now();

select setval(pg_get_serial_sequence('public.funcionarios', 'id'), coalesce((select max(id) from public.funcionarios), 1), true);
select setval(pg_get_serial_sequence('public.ponto', 'id'), coalesce((select max(id) from public.ponto), 1), true);
