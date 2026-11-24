import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../database.js";

const router = express.Router();

// Regista o restaurante e o respetivo administrador na mesma transacao.
router.post("/registar", async (req, res) => {
    const { nomeRestaurante, nome, email, senha, telefone } = req.body || {};

    if (!nomeRestaurante?.trim() || !nome?.trim() || !email?.trim() || !senha) {
        return res.status(400).json({
            mensagem: "Preenche o nome do restaurante, nome do administrador, e-mail e palavra-passe."
        });
    }
    if (senha.length < 8) {
        return res.status(400).json({ mensagem: "A palavra-passe deve ter pelo menos 8 caracteres." });
    }

    const emailNormalizado = email.trim().toLowerCase();
    const nomeRestauranteLimpo = nomeRestaurante.trim();
    const nomeLimpo = nome.trim();

    if (nomeRestauranteLimpo.length > 150) {
        return res.status(400).json({ mensagem: "O nome do restaurante não pode ultrapassar 150 caracteres." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
        return res.status(400).json({ mensagem: "Introduz um endereço de e-mail válido." });
    }
    if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET não está configurado.");
        return res.status(500).json({ mensagem: "A autenticação não está configurada no servidor." });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const existente = await client.query(
            "SELECT id FROM public.utilizadores WHERE email = $1 LIMIT 1",
            [emailNormalizado]
        );
        if (existente.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ mensagem: "Este e-mail já está registado." });
        }

        const restauranteResult = await client.query(
            `INSERT INTO public.restaurantes
                (nome, telefone, email, moeda, ativo, data_criacao)
             VALUES ($1, $2, $3, 'AOA', TRUE, NOW())
             RETURNING id, nome, moeda`,
            [nomeRestauranteLimpo, telefone?.trim() || null, emailNormalizado]
        );
        const restaurante = restauranteResult.rows[0];
        const senhaHash = await bcrypt.hash(senha, 12);

        const utilizadorResult = await client.query(
            `INSERT INTO public.utilizadores
                (nome, email, telefone, senha_hash, tipo_usuario,
                 ativo, data_cadastro, restaurante_id)
             VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), $6)
             RETURNING id, nome, email, telefone, tipo_usuario, restaurante_id`,
            [nomeLimpo, emailNormalizado, telefone?.trim() || null, senhaHash, "admin", restaurante.id]
        );

        await client.query("COMMIT");
        return res.status(201).json({
            mensagem: "Restaurante e administrador registados com sucesso.",
            restaurante,
            utilizador: utilizadorResult.rows[0]
        });
    } catch (erro) {
        if (client) {
            try { await client.query("ROLLBACK"); }
            catch (rollbackError) { console.error("Erro ao reverter registo:", rollbackError.message); }
        }
        console.error("Erro no registo:", erro.message);
        if (erro.code === "23505") {
            return res.status(409).json({ mensagem: "Já existe um registo com estes dados. Verifica o e-mail." });
        }
        return res.status(500).json({ mensagem: "Erro ao registar restaurante e administrador. Consulta o terminal da API." });
    } finally {
        client?.release();
    }
});

// Inicia sessao e inclui a identificacao do restaurante no JWT.
router.post("/login", async (req, res) => {
    try {
        const { email, senha } = req.body || {};
        if (!email?.trim() || !senha) {
            return res.status(400).json({ mensagem: "Introduz o e-mail e a palavra-passe." });
        }
        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET não está configurado.");
            return res.status(500).json({ mensagem: "A autenticação não está configurada no servidor." });
        }

        const emailNormalizado = email.trim().toLowerCase();
        const resultado = await pool.query(
            `SELECT u.id, u.nome, u.email, u.telefone, u.senha_hash,
                    u.tipo_usuario, u.ativo, u.restaurante_id,
                    r.nome AS nome_restaurante, r.ativo AS restaurante_ativo
             FROM public.utilizadores u
             INNER JOIN public.restaurantes r ON r.id = u.restaurante_id
             WHERE u.email = $1 LIMIT 1`,
            [emailNormalizado]
        );
        if (resultado.rows.length === 0) {
            return res.status(401).json({ mensagem: "E-mail ou palavra-passe incorretos." });
        }

        const utilizador = resultado.rows[0];
        if (!utilizador.ativo || !utilizador.restaurante_ativo) {
            return res.status(403).json({ mensagem: "A conta ou o restaurante está desativado." });
        }
        const senhaValida = await bcrypt.compare(senha, utilizador.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ mensagem: "E-mail ou palavra-passe incorretos." });
        }

        const token = jwt.sign(
            { id: utilizador.id, tipo: utilizador.tipo_usuario, restaurante_id: utilizador.restaurante_id },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );
        return res.json({
            mensagem: "Sessão iniciada com sucesso.",
            token,
            utilizador: {
                id: utilizador.id,
                nome: utilizador.nome,
                email: utilizador.email,
                telefone: utilizador.telefone,
                tipo_usuario: utilizador.tipo_usuario,
                restaurante_id: utilizador.restaurante_id,
                nome_restaurante: utilizador.nome_restaurante
            }
        });
    } catch (erro) {
        console.error("Erro no login:", erro.message);
        return res.status(500).json({ mensagem: "Erro ao iniciar sessão." });
    }
});

export default router;
