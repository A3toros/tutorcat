-- Student login: username = Student ID, password = same Student ID (e.g. 52439 / 52439)
-- Run in Neon after roster exists.

BEGIN;

UPDATE users
SET username = school_student_id
WHERE role = 'student'
  AND school_student_id IS NOT NULL;

UPDATE users
SET password_hash = CASE school_student_id
    WHEN '52439' THEN '$2a$12$hqQvLpHKZ7it4w8Vye0ps.j6yhFi0..U8t0BoYmKfHS1dZeWNIEv.'
    WHEN '52440' THEN '$2a$12$t7VzUNEIXWq2neVcJ61o.OsNnp3VZpq/Rd29GNc3nX2hfNRfO6OBO'
    WHEN '52441' THEN '$2a$12$Qk.7fHQpGKCAekwjRp3wluxxsT3gUBEcN5.s0pI8ABJXz/kIWUERm'
    WHEN '52442' THEN '$2a$12$xflgyJ3aUPRN5ubCmmsugOjPInXr.iia8sPeaozA84w.JISvzNLXy'
    WHEN '52443' THEN '$2a$12$FL2HZVqEM3mvnKne2QHc6.vVETbgLxlfNAl.RsEAw/2P9Ef2LW9si'
    WHEN '52444' THEN '$2a$12$/5yY8McaiqujcfmpMDzpY.sRAgT9.wUPjR.EdMfB311FUnHJOPh2G'
    WHEN '52445' THEN '$2a$12$MWW26Y4jGa4TqIO8/CL3iOUZPy6UeObRNBNxzNg0dj77D6XFLeczS'
    WHEN '52446' THEN '$2a$12$EUmKobxo2eI4oHkd0vlLo.JgRS8GPxEXjyf99a59vAu2LEn0zrQFm'
    WHEN '52447' THEN '$2a$12$b8DHsiypWya/GaPmOoYf3Ow2XyyNu.QBB9PGdZKvAdKtTpTZqS/sC'
    WHEN '52448' THEN '$2a$12$cD7RMhcg39CAgmbsxywKKOhQATeqnRRI6QR7mvbCB1CgIDRL/fSPG'
    WHEN '52449' THEN '$2a$12$xaP1O98y5sl7ANLb7bnCEu.uBWZqXbQBwTiP3mttcDpQeqnwdxrhm'
    WHEN '52450' THEN '$2a$12$J29lVjW8w5sdBa4QvtNxkO2M/irbEk3JtdHwb7/FVdaf3uMhhVqqG'
    WHEN '52451' THEN '$2a$12$2bEHevJ3ULlLEuYdCxcXKOirncE0g301rMP0Mj7WBpCtnTh60LQsi'
    WHEN '52452' THEN '$2a$12$iZ/jpXbIyVvTNZhJzrJs7enHWf347Q78WkCjLkaIpIivAl9XM8Rtm'
    WHEN '52453' THEN '$2a$12$cEWxh17h5l/Scr47roAlFectUScIrJsMrSJqanqbSHFz0u0ediAWu'
    WHEN '52454' THEN '$2a$12$caw5CqClonmxwTJac/OJzuFPIAXSI4jbvO5lkutH1tgrOX579wPBW'
    WHEN '52455' THEN '$2a$12$z4Oo37nMBJ9elYBcOnunc.cfHROIvZoK1dYOKl8SIblgA1mo2SnmK'
    WHEN '52456' THEN '$2a$12$uq2VEE/iGY/Zd3f0bW9cf.qo/jp7VVf9LLcKWvKrIXQGh5zWrGmG.'
    WHEN '52457' THEN '$2a$12$IBsA.nqYJmn56eJBYt4F4.wCEGRObf/iq9Bg2QgGRn1qhyWuzlTdC'
    WHEN '52458' THEN '$2a$12$n3Nd7BVzfjMy2lU1LFjZb.KMPdPLzmq9yMWM5Mb6k96N9UINiu.G.'
    WHEN '52459' THEN '$2a$12$XLDsMC8zK7hnrQQHJXW33OzD0mfn0qlwp/rg2q7IRbyUeXfsyFMU2'
    WHEN '52460' THEN '$2a$12$gKFLIhZ9YL.3pCAxjv4ICOny4tGCBPWMxJetqGAonLrdccVxr.8i6'
    WHEN '52461' THEN '$2a$12$Dz/knhkYqLW6sy7fDYTvFuaxHmQc/S23q8GxyUnwvzk3gmv6W9n.C'
    WHEN '52462' THEN '$2a$12$zooe4pshgbDhzNIjZXdAVOfMitK3iZG9C5KqwqnnXYyp5MIS6jp9a'
    WHEN '52463' THEN '$2a$12$bC7wB5WNBsM64NSMQ7cQL.8PaOwpBP9UYcCBQUxLBdpDobID23ujK'
    WHEN '52464' THEN '$2a$12$dklGowGooNeq7UOFeclEXOXNicL/OT1q8jyDNbR1iOsgM6zx8nruS'
    WHEN '52465' THEN '$2a$12$Kr6F36fkoLlKeJ7eleuck.NDLo2MEwGPi/bhT6FtqbN1tfPpRTJ.q'
    WHEN '52466' THEN '$2a$12$gpnZD6MX.vwXUeke5CR.sOp18Sths1LnVAfQeJQPqlC0J//x.qT5O'
    WHEN '52467' THEN '$2a$12$H45BswMw/17sCmCqjcgtYOx9kICcTHcg6zm0H7e1s07THBqekDX86'
    WHEN '52468' THEN '$2a$12$DM4/auxLaWbRxLHV3My9tOVfvZBmLFty9ZpZbkexOnkyE4VCPbjsm'
    WHEN '52469' THEN '$2a$12$SDQfIHa2UQJzJvL44VvcuuFb6fNJJqIkQEa75BR3LsleTOi1ff9NO'
    WHEN '52470' THEN '$2a$12$wEt3yW9fOLnAa6C5bIU//Oz4FMdCGzQ9p8CHKQ94hTltLEiqlltg2'
    ELSE password_hash
  END
WHERE role = 'student'
  AND school_student_id >= '52439'
  AND school_student_id <= '52470';

COMMIT;
