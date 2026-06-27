name := "HRF"

version := "0.8.140"

scalaVersion := "2.13.16"

scalacOptions := Seq(
    "-unchecked",
    "-deprecation",
    "-feature",
    "-language:postfixOps",
    "-language:implicitConversions",
    "-Xlint:infer-any",
    "-Wconf:" + List(
        "will become a keyword",
        "procedure syntax",
        "a number and a",
        "implicitConversions visible",
        "outer reference in this type test",
        "match may not be exhaustive",
        "unreachable code",
        "analysis reached max recursion depth",
        "definition should have explicit type"
    ).map("msg=" + _ + ":s").mkString(",")
)

Compile / unmanagedSourceDirectories += baseDirectory.value / "arcs"

libraryDependencies += "com.lihaoyi" %%% "fastparse" % "3.0.2"

libraryDependencies += "com.lihaoyi" %%% "pprint" % "0.7.0"

libraryDependencies += "com.lihaoyi" %%% "fansi" % "0.4.0"

libraryDependencies += "pt.kcry" %%% "blake3" % "3.1.2"

libraryDependencies += "org.scala-lang.modules" %%% "scala-collection-contrib" % "0.3.0"

Compile / sourceGenerators += Def.task {
    val file = (Compile / sourceManaged).value / "info.scala"
    IO.write(file, """package hrf { object BuildInfo { val name = "%s" ; val version = "%s" ; val time = %d ; val seed = "%s" } }""".stripMargin.format(name.value, version.value, System.currentTimeMillis % (24 * 60 * 60 * 1000), scala.util.Random.alphanumeric.take(16)))
    Seq(file)
}

Global / onChangedBuildSource := IgnoreSourceChanges

bspEnabled := false

maxErrors := 5
