
import pool from "./database.js";

async function testarBanco() {
    try {
        console.log("A verificar os esquemas e as tabelas...");

        const resultado = await pool.query(
            `SELECT table_schema, table_name
             FROM information_schema.tables
             WHERE table_schema <> $1
             AND table_schema <> $2
             ORDER BY table_schema, table_name`,
            ["pg_catalog", "information_schema"]
        );

        if (resultado.rows.length === 0) {
            console.log("Não foram encontradas tabelas.");
        } else {
            console.table(resultado.rows);
        }

    } catch (erro) {
        console.error("Erro:", erro.message);
    } finally {
        await pool.end();
    }
}

testarBanco();
