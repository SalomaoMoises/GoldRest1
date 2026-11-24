
import "dotenv/config";
import express from "express";
import cors from "cors";
import pool from "./database.js";
import authRoutes from "./routes/auth.js";

const app = express();

app.use(cors());
app.use(express.json());

// Rota principal
app.get("/", (req, res) => {
    res.json({
        mensagem: "API GOLDREST ativa."
    });
});

// Testar Supabase
app.get("/api/teste-banco", async (req, res) => {
    try {
        const resultado = await pool.query(
            "SELECT NOW() AS horario, current_database() AS banco"
        );

        res.json({
            mensagem: "Ligação ao Supabase realizada com sucesso!",
            banco: resultado.rows[0].banco,
            horario: resultado.rows[0].horario
        });
    } catch (erro) {
        console.error(erro.message);
        res.status(500).json({
            mensagem: "Erro na ligação ao Supabase."
        });
    }
});

// Ligar autenticação
app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`API GOLDREST disponível em http://localhost:${PORT}`);
});
