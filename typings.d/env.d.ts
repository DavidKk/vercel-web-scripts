declare namespace NodeJS {
  interface ProcessEnv {
    /** GitHub Gist Id */
    GIST_ID: string
    /** GitHub Gist Token */
    GIST_TOKEN: string
    /** Admin Username */
    ACCESS_USERNAME: string
    /** Admin Password */
    ACCESS_PASSWORD: string
    /** 2FA Secret */
    ACCESS_2FA_SECRET?: string
    /** JWT Secret */
    JWT_SECRET: string
    /** JWT Token Expiration Time */
    JWT_EXPIRES_IN: string
    /** 自定义三方登录入口 */
    NEXT_PUBLIC_OAUTH_LOGIN_URL?: string
    /** 三方服务端公钥，用于 ECDH 解密 */
    NEXT_PUBLIC_OAUTH_SERVER_PUBLIC_KEY?: string
    /** 三方 JWT 签名密钥（可复用 JWT_SECRET） */
    OAUTH_JWT_SECRET?: string
  }
}
