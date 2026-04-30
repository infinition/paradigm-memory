class ParadigmMemory < Formula
  desc "Local-first navigable memory MCP for coding agents"
  homepage "https://github.com/Infinition/paradigm-memory"
  url "https://registry.npmjs.org/@paradigm-memory/memory-cli/-/memory-cli-0.1.0.tgz"
  sha256 "REPLACE_WITH_NPM_TARBALL_SHA256"
  license "Apache-2.0"

  depends_on "node@22"

  def install
    system "npm", "install", *std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "paradigm", shell_output("#{bin}/paradigm --help")
  end
end
