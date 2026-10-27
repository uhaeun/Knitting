alter table results drop constraint results_kind_check;
alter table results add constraint results_kind_check check(kind in ('single','beforeAfter','triple','growth'));
