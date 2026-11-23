import "reflect-metadata";
import {
    Entity,
    Filter,
    ManyToOne,
    PrimaryKey,
    Property,
    ReflectMetadataProvider,
} from "@mikro-orm/decorators/legacy";
import { MikroORM } from "@mikro-orm/sqlite";

// A relation-level `filters` override on one to-one relation should only
// affect that relation. Instead it leaks into every relation processed after
// it, so their filtered joins are dropped.

const softDelete = {
    name: "softDelete",
    cond: { deletedAt: null },
    default: true,
};

@Entity()
@Filter(softDelete)
class User {
    @PrimaryKey()
    id!: number;

    @Property()
    name!: string;

    @Property({ nullable: true })
    deletedAt?: Date;
}

@Entity()
@Filter(softDelete)
class Author {
    @PrimaryKey()
    id!: number;

    @Property()
    name!: string;

    @Property({ nullable: true })
    deletedAt?: Date;
}

// No override: both relations are auto-joined with the soft-delete filter.
@Entity()
class BookNoOverride {
    @PrimaryKey()
    id!: number;

    @Property()
    title!: string;

    @ManyToOne(() => User)
    createdBy!: User;

    @ManyToOne(() => Author)
    author!: Author;
}

// `createdBy` opts out of the soft-delete filter and is declared first.
@Entity()
class BookSoftDeleteOff {
    @PrimaryKey()
    id!: number;

    @Property()
    title!: string;

    @ManyToOne(() => User, { filters: { softDelete: false } })
    createdBy!: User;

    @ManyToOne(() => Author)
    author!: Author;
}

// Same as above with `filters: false`.
@Entity()
class BookFiltersOff {
    @PrimaryKey()
    id!: number;

    @Property()
    title!: string;

    @ManyToOne(() => User, { filters: false })
    createdBy!: User;

    @ManyToOne(() => Author)
    author!: Author;
}

// Same override as BookSoftDeleteOff, but declared after `author`.
@Entity()
class BookAuthorFirst {
    @PrimaryKey()
    id!: number;

    @Property()
    title!: string;

    @ManyToOne(() => Author)
    author!: Author;

    @ManyToOne(() => User, { filters: { softDelete: false } })
    createdBy!: User;
}

let orm: MikroORM;

beforeAll(async () => {
    orm = await MikroORM.init({
        dbName: ":memory:",
        entities: [
            User,
            Author,
            BookNoOverride,
            BookSoftDeleteOff,
            BookFiltersOff,
            BookAuthorFirst,
        ],
        metadataProvider: ReflectMetadataProvider,
        debug: ["query", "query-params"],
        allowGlobalContext: true, // only for testing
    });
    await orm.schema.refresh();

    const em = orm.em.fork();
    const alice = em.create(User, { name: "alice" });
    const dan = em.create(User, { name: "dan", deletedAt: new Date() });
    const ann = em.create(Author, { name: "ann" });
    const zed = em.create(Author, { name: "zed", deletedAt: new Date() });

    for (const entity of [
        BookNoOverride,
        BookSoftDeleteOff,
        BookFiltersOff,
        BookAuthorFirst,
    ]) {
        // created by a soft-deleted user, live author: only visible when createdBy opts out
        em.create(entity, {
            title: "by deleted user",
            createdBy: dan,
            author: ann,
        });
        // live user, soft-deleted author: must stay hidden
        em.create(entity, {
            title: "by deleted author",
            createdBy: alice,
            author: zed,
        });
    }
    await em.flush();
});

afterAll(async () => {
    await orm.close(true);
});

const titles = async (entity: any, where: object = {}) => {
    const books = await orm.em.fork().find(entity, where);
    return books.map((book: any) => book.title).sort();
};

test("control: no override hides books whose user or author is soft-deleted", async () => {
    expect(await titles(BookNoOverride)).toEqual([]);
});

test("control: override declared after author only affects createdBy", async () => {
    expect(await titles(BookAuthorFirst)).toEqual(["by deleted user"]);
});

test("createdBy { filters: { softDelete: false } } should not affect author", async () => {
    // actual: ['by deleted user', 'by deleted author'], the author join is dropped
    expect(await titles(BookSoftDeleteOff)).toEqual(["by deleted user"]);
});

test("createdBy { filters: false } should not affect author", async () => {
    // actual: ['by deleted user', 'by deleted author'], the author join is dropped
    expect(await titles(BookFiltersOff)).toEqual(["by deleted user"]);
});

test("createdBy { filters: { softDelete: false } } should not affect author with select-in populate", async () => {
    // Joined/balanced populate filters the author join itself, so they are unaffected here.
    const books = await orm.em
        .fork()
        .find(
            BookSoftDeleteOff,
            {},
            { populate: ["author"], strategy: "select-in" },
        );
    // actual: also returns 'by deleted author' with an unloaded author reference
    expect(books.map((book) => book.title).sort()).toEqual(["by deleted user"]);
});

test("createdBy { filters: false } should not affect author joins from where conditions", async () => {
    // actual: ['by deleted author'], the author join has no `deleted_at is null`
    expect(
        await titles(BookFiltersOff, {
            createdBy: { name: "alice" },
            author: { name: "zed" },
        }),
    ).toEqual([]);
});
