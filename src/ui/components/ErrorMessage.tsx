export function ErrorMessage({ mensagem }: { mensagem: string }) {
    return <div className="mensagem-erro">Erro: {mensagem}</div>;
}
