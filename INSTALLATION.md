
# INSTALLATON INSTRUCTIONS HAS A NEW HOME

We've updated our installation instructions and moved them to our dedicated documentation portal to provide you with a better experience and updated guidance. Whether you're looking to self-host OpenSign™ or contribute to its development, you can find detailed instructions tailored to your needs at [docs.opensignlabs.com](https://docs.opensignlabs.com).

## Self Hosting

If you're interested in self-hosting OpenSign™, our new documentation portal provides comprehensive, step-by-step instructions to help you set up OpenSign™ in your own environment. This section is designed for system administrators and those looking to deploy OpenSign™ within their organization or for personal use.

- **Access Self Hosting Instructions:** [Self Hosting Guide](https://docs.opensignlabs.com/docs/category/docker)

## Contributors

For developers and contributors who are looking to build upon or contribute to OpenSign™, we've prepared a separate section that covers the setup, development environment configuration, and guidelines for contributing to the OpenSign™ project.

- **Access Contributor Instructions:** [Contributors Guide](https://docs.opensignlabs.com/docs/contribute/INSTALLATION)

## Additional Resources

Should you need further assistance or have any questions, please feel free to reach out to us through our support channels:

- **Twitter:** [OpenSignHQ on Twitter](https://twitter.com/OpenSignHQ)
- **Facebook:** [OpenSign on Facebook](https://www.facebook.com/profile.php?id=61551030403669)
- **LinkedIn:** [OpenSign™ on LinkedIn](https://www.linkedin.com/company/opensign%E2%84%A2/)
- **Discord:** [Join our Discord Community](https://discord.com/invite/opensign)
- **YouTube:** [OpenSignHQ on YouTube](https://www.youtube.com/@opensignhq)

We are committed to providing you with the support you need to successfully install and use OpenSign™. Visit our website at [www.opensignlabs.com](https://www.opensignlabs.com) for more information about our project and its features.


## Configuração deste fork

O idioma padrão do frontend é português do Brasil. O seletor continua
disponível para quem preferir outro idioma.

### Executar as mudanças com Docker

1. Copie `.env.example` para `.env.prod` e preencha os dados da sua instalação.
   Em uma instalação nova, conclua a configuração do administrador em
   uma rede privada antes de liberar o domínio.
2. Gere o frontend em `apps/OpenSign` com Node.js 22 LTS, usando
   `npm ci` e `npm run build`.
3. Na raiz do repositório, inicie o Compose com o código do fork.

   ```sh
   docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.fork.yml up -d
   ```

O arquivo adicional monta o frontend compilado e os módulos do fork sobre
as imagens do projeto, sem publicar uma imagem Docker própria. Use as
imagens da mesma revisão do OpenSign ao atualizar dependências. Configure
`HOST_URL` para apontar ao endereço HTTPS do app. O Caddy serve o frontend e
encaminha `/api/` ao backend na mesma origem.

### Entrar ou criar uma conta pelo Google

No Google Auth Platform, crie um ID de cliente OAuth para um aplicativo web.
Em **Origens JavaScript autorizadas**, informe a origem HTTPS da sua
instalação. Defina `DOCSIGN_GOOGLE_CLIENT_ID` em `.env.prod`. No Compose do
fork, esse mesmo ID público é disponibilizado ao frontend.

Defina `DOCSIGN_GOOGLE_SIGNUP_ENABLED=true` para criar um espaço próprio
no primeiro acesso. Com o cadastro desativado, usuários ativos já
cadastrados podem entrar com o Gmail correspondente ou vincular a conta
Google pelo perfil. O aplicativo verifica os tokens do Google no servidor.

### Enviar e-mails pela API do Resend

Configure `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no backend. Use uma chave
de envio e um endereço de um domínio verificado no Resend. Com as duas
variáveis configuradas, o Resend envia os e-mails padrão do sistema,
inclusive verificações, redefinição de senha e mensagens com anexos.

O Compose do fork mantém a chave do Resend na configuração do backend.
Guarde o arquivo `.env.prod` fora do controle de versão.
